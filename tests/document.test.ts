import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_DOCUMENT_BYTES, safeFileName, sniffDocument } from "../src/lib/document";

describe("sniffDocument", () => {
  it("reconhece PDF pelo cabeçalho", () => {
    assert.equal(sniffDocument(Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj")), "pdf");
  });
  it("reconhece imagens (delegando para sniffImage)", () => {
    assert.equal(sniffDocument(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpeg");
    assert.equal(sniffDocument(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "png");
  });
  it("recusa o que não é PDF nem imagem, mesmo com extensão certa", () => {
    assert.equal(sniffDocument(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>")), null);
    assert.equal(sniffDocument(Buffer.from("PK\u0003\u0004 docx zip")), null); // Office
    assert.equal(sniffDocument(Buffer.from("<!doctype html>")), null);
    assert.equal(sniffDocument(Buffer.alloc(0)), null);
    assert.equal(sniffDocument(Buffer.from("%PDF")), null); // truncado
  });
  it("limite cabe num PDF escaneado, mas não em vídeo", () => {
    assert.ok(MAX_DOCUMENT_BYTES >= 5_000_000 && MAX_DOCUMENT_BYTES <= 10_000_000);
  });
});

describe("safeFileName", () => {
  it("remove caminho, aspas e caracteres de controle", () => {
    assert.equal(safeFileName(String.raw`..\..\etc\"laudo".pdf`, "pdf"), "laudo.pdf");
    assert.equal(safeFileName("/tmp/laudo joão.pdf", "pdf"), "laudo joão.pdf");
    assert.equal(safeFileName("x\r\ny.pdf", "pdf"), "xy.pdf");
  });
  it("garante extensão e fallback", () => {
    assert.equal(safeFileName("laudo", "pdf"), "laudo.pdf");
    assert.equal(safeFileName("", "jpg"), "documento.jpg");
    assert.equal(safeFileName("..", "pdf"), "documento.pdf");
  });
  it("trunca nomes enormes", () => {
    assert.ok(safeFileName("a".repeat(500) + ".pdf", "pdf").length <= 125);
  });
});
