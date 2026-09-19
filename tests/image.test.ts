import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sniffImage } from "../src/lib/image";

describe("sniffImage", () => {
  it("reconhece jpeg, png e webp pelos magic bytes", () => {
    assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpeg");
    assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "png");
    assert.equal(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])), "webp");
  });
  it("rejeita outros formatos e buffers curtos", () => {
    assert.equal(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null); // SVG pode carregar script
    assert.equal(sniffImage(Buffer.from("GIF89a......")), null);
    assert.equal(sniffImage(Buffer.from([0xff, 0xd8])), null);
  });
});
