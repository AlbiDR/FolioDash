import { readFileSync } from "node:fs";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pngContent } from "./png-content.ts";

const original = readFileSync("src/interfaces/web/public/icons/favicon-48.png");
function repack(changePixel = false): Buffer {
  const chunks: Buffer[] = [original.subarray(0, 8)];
  for (let offset = 8; offset < original.length;) {
    const length = original.readUInt32BE(offset);
    const end = offset + length + 12;
    if (original.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      const rows = inflateSync(original.subarray(offset + 8, end - 4));
      if (changePixel) rows[5] = (rows[5] ?? 0) ^ 1;
      const data = deflateSync(rows, { level: 0 });
      const body = Buffer.concat([Buffer.from("IDAT"), data]);
      const header = Buffer.alloc(4);
      header.writeUInt32BE(data.length);
      const checksum = Buffer.alloc(4);
      checksum.writeUInt32BE(crc32(body));
      chunks.push(header, body, checksum);
    } else chunks.push(original.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

void describe("PNG content integrity", () => {
  void it("accepts identical artwork encoded with different compression", () => {
    const repacked = repack();
    assert.equal(repacked.equals(original), false);
    assert.deepEqual(pngContent(repacked), pngContent(original));
  });
  void it("detects changed pixels even with valid checksums", () => {
    assert.notDeepEqual(pngContent(repack(true)), pngContent(original));
  });
  void it("rejects damaged checksums and truncated files", () => {
    const damaged = Buffer.from(original);
    damaged[45] = (damaged[45] ?? 0) ^ 1;
    assert.throws(() => pngContent(damaged), /checksum/u);
    assert.throws(() => pngContent(original.subarray(0, -2)));
  });
});
