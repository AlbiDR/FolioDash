import { crc32, inflateSync } from "node:zlib";

/** Compare every PNG chunk and checksum, allowing only the IDAT compression to vary. */
export function pngContent(bytes: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error("Invalid PNG signature");
  const chunks: Buffer[] = [signature];
  const compressed: Buffer[] = [];
  let offset = 8;
  let ended = false;
  while (offset < bytes.length) {
    if (ended || offset + 12 > bytes.length) throw new Error("Invalid PNG chunk boundary");
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("Truncated PNG chunk");
    const body = bytes.subarray(offset + 4, end - 4);
    if (crc32(body) !== bytes.readUInt32BE(end - 4)) throw new Error("Invalid PNG checksum");
    const type = body.toString("ascii", 0, 4);
    if (type === "IDAT") compressed.push(body.subarray(4));
    else chunks.push(bytes.subarray(offset, end));
    ended = type === "IEND";
    offset = end;
  }
  if (!ended || compressed.length === 0) throw new Error("Incomplete PNG");
  return Buffer.concat([...chunks, inflateSync(Buffer.concat(compressed))]);
}
