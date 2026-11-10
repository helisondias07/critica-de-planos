import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteContains } from "../src/source.ts";

const source =
  "Passo único. Não deve ser executado. Serve apenas como veículo do laboratório de timeout.";

describe("citação estrutural endurecida (não é relevância semântica)", () => {
  it("aceita trecho longo com fronteira de palavra após NFKC", () => {
    assert.equal(quoteContains(source, "Não deve ser executado"), true);
    const nfc = "Não deve ser executado";
    const nfd = nfc.normalize("NFD");
    assert.equal(quoteContains(source, nfd), true);
  });

  it("rejeita substring curta (≥8 chars antigo) e trechos triviais", () => {
    assert.equal(quoteContains(source, "executad"), false);
    assert.equal(quoteContains(source, "veículo"), false);
    assert.equal(quoteContains("o plano e o passo", "o plano"), false);
    assert.equal(quoteContains(source, "timeout"), false);
  });

  it("rejeita match no meio da palavra", () => {
    assert.equal(quoteContains("localStorage mock sem PAN", "Storage mock sem"), false);
  });

  it("não afirma que tokens consecutivos impliquem relevância", () => {
    assert.equal(
      quoteContains(source, "Serve apenas como veículo"),
      true,
      "match estrutural possível mesmo sem ser o risco",
    );
  });
});
