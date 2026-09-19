import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeS3Path, sha256Hex, signV4 } from "../src/lib/storage/sigv4";

// Exemplo oficial da AWS ("GET Object", docs de autenticação header-based):
// credenciais de teste públicas, resultado conhecido.
describe("signV4", () => {
  it("reproduz a assinatura do exemplo oficial da AWS", () => {
    const { authorization } = signV4({
      method: "GET",
      path: "/test.txt",
      query: "",
      headers: {
        host: "examplebucket.s3.amazonaws.com",
        range: "bytes=0-9",
        "x-amz-content-sha256": sha256Hex(""),
        "x-amz-date": "20130524T000000Z",
      },
      payloadHash: sha256Hex(""),
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      amzDate: "20130524T000000Z",
    });
    assert.equal(
      authorization,
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("sha256 do corpo vazio é o valor conhecido", () => {
    assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("encodeS3Path", () => {
  it("mantém barras e codifica espaços e acentos por segmento", () => {
    assert.equal(encodeS3Path("hecca-psico/professionals/a b/ção.jpg"), "hecca-psico/professionals/a%20b/%C3%A7%C3%A3o.jpg");
  });
});
