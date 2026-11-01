import { type XlsxLimits, XlsxError } from "./XlsxError";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_LENGTH = 22;
const MAX_COMMENT_LENGTH = 65_535;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;
const FLAG_ENCRYPTED = 0x1;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
}

export interface ZipArchive {
  readonly names: readonly string[];
  /** Returns the entry's bytes, verified against its declared size and CRC. */
  read(name: string): Promise<Uint8Array>;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const data = view(bytes);
  const lowest = Math.max(0, bytes.length - EOCD_MIN_LENGTH - MAX_COMMENT_LENGTH);
  for (let offset = bytes.length - EOCD_MIN_LENGTH; offset >= lowest; offset--) {
    if (data.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new XlsxError("not-a-zip", "The file is not a valid .xlsx (zip) file.");
}

async function inflate(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const writing = writer.write(data).then(() => writer.close());
  writing.catch(() => undefined);
  const reader = stream.readable.getReader();
  const output = new Uint8Array(expectedSize);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      if (length + value.length > expectedSize) {
        await reader.cancel();
        throw new XlsxError("limit-exceeded", "A file part expands to more than its declared size.");
      }
      output.set(value, length);
      length += value.length;
    }
  } catch (error) {
    if (error instanceof XlsxError) throw error;
    throw new XlsxError("corrupt", "A compressed part of the file is damaged.");
  }
  if (length !== expectedSize) throw new XlsxError("corrupt", "A part of the file is shorter than declared.");
  return output;
}

/** Opens a zip archive from memory, rejecting anything outside the supported, bounded subset. */
export function openZip(bytes: Uint8Array, limits: XlsxLimits): ZipArchive {
  if (bytes.length > limits.maxFileBytes) {
    throw new XlsxError("limit-exceeded", "The file is larger than the supported size.");
  }
  if (bytes.length < EOCD_MIN_LENGTH) throw new XlsxError("not-a-zip", "The file is not a valid .xlsx (zip) file.");
  const data = view(bytes);
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = data.getUint16(eocd + 10, true);
  const directorySize = data.getUint32(eocd + 12, true);
  const directoryOffset = data.getUint32(eocd + 16, true);
  if (
    data.getUint16(eocd + 4, true) !== 0 ||
    data.getUint16(eocd + 6, true) !== 0 ||
    entryCount === ZIP64_MARKER_16 ||
    directorySize === ZIP64_MARKER_32 ||
    directoryOffset === ZIP64_MARKER_32
  ) {
    throw new XlsxError("unsupported-zip", "Multi-disk and zip64 archives are not supported.");
  }
  if (entryCount > limits.maxEntries) throw new XlsxError("limit-exceeded", "The file contains too many parts.");
  if (directoryOffset + directorySize > bytes.length) throw new XlsxError("corrupt", "The zip directory is damaged.");

  const decoder = new TextDecoder("utf-8");
  const entries = new Map<string, ZipEntry>();
  let total = 0;
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.length || data.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new XlsxError("corrupt", "The zip directory is damaged.");
    }
    const flags = data.getUint16(offset + 8, true);
    const method = data.getUint16(offset + 10, true);
    const crc = data.getUint32(offset + 16, true);
    const compressedSize = data.getUint32(offset + 20, true);
    const size = data.getUint32(offset + 24, true);
    const nameLength = data.getUint16(offset + 28, true);
    const extraLength = data.getUint16(offset + 30, true);
    const commentLength = data.getUint16(offset + 32, true);
    const localOffset = data.getUint32(offset + 42, true);
    if (offset + 46 + nameLength > bytes.length) throw new XlsxError("corrupt", "The zip directory is damaged.");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (flags & FLAG_ENCRYPTED) throw new XlsxError("unsupported-zip", "Encrypted files are not supported.");
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new XlsxError("unsupported-zip", "The file uses an unsupported compression method.");
    }
    if (compressedSize === ZIP64_MARKER_32 || size === ZIP64_MARKER_32) {
      throw new XlsxError("unsupported-zip", "Multi-disk and zip64 archives are not supported.");
    }
    if (entries.has(name)) throw new XlsxError("corrupt", "The file contains the same part twice.");
    if (size > limits.maxEntryBytes) throw new XlsxError("limit-exceeded", "A part of the file is too large.");
    total += size;
    if (total > limits.maxTotalBytes) throw new XlsxError("limit-exceeded", "The file expands to more than the supported size.");
    entries.set(name, { name, method, crc, compressedSize, size, localOffset });
  }

  return {
    names: [...entries.keys()],
    async read(name: string): Promise<Uint8Array> {
      const entry = entries.get(name);
      if (entry === undefined) throw new XlsxError("missing-part", `The file has no part named ${name}.`);
      const start = entry.localOffset;
      if (start + 30 > bytes.length || data.getUint32(start, true) !== LOCAL_SIGNATURE) {
        throw new XlsxError("corrupt", "A part of the file is damaged.");
      }
      const dataStart = start + 30 + data.getUint16(start + 26, true) + data.getUint16(start + 28, true);
      const dataEnd = dataStart + entry.compressedSize;
      if (dataEnd > bytes.length) throw new XlsxError("corrupt", "A part of the file is cut short.");
      const raw = bytes.subarray(dataStart, dataEnd);
      let content: Uint8Array;
      if (entry.method === METHOD_STORED) {
        if (entry.compressedSize !== entry.size) throw new XlsxError("corrupt", "A part of the file is damaged.");
        content = raw.slice();
      } else {
        content = await inflate(raw, entry.size);
      }
      if (crc32(content) !== entry.crc) throw new XlsxError("corrupt", "A part of the file failed its integrity check.");
      return content;
    },
  };
}
