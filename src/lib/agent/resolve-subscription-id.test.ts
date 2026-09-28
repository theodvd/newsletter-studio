import { describe, expect, it } from "vitest";
import { resolveSubscriptionIdCandidates } from "./resolve-subscription-id";

describe("resolveSubscriptionIdCandidates", () => {
  it("aucun id connu ni fourni : aucun candidat (création d'un nouveau brouillon)", () => {
    expect(resolveSubscriptionIdCandidates({})).toEqual([]);
    expect(resolveSubscriptionIdCandidates({ inputId: null, knownId: null })).toEqual([]);
    expect(resolveSubscriptionIdCandidates({ inputId: "", knownId: "" })).toEqual([]);
  });

  it("seul l'input est fourni : il est l'unique candidat", () => {
    expect(resolveSubscriptionIdCandidates({ inputId: "sub-1" })).toEqual(["sub-1"]);
    expect(resolveSubscriptionIdCandidates({ inputId: "sub-1", knownId: null })).toEqual(["sub-1"]);
  });

  it("l'agent omet subscription_id : l'id connu côté serveur devient l'unique candidat (corrige le doublon)", () => {
    expect(resolveSubscriptionIdCandidates({ knownId: "sub-known" })).toEqual(["sub-known"]);
    expect(resolveSubscriptionIdCandidates({ inputId: undefined, knownId: "sub-known" })).toEqual(["sub-known"]);
  });

  it("les deux sont fournis et identiques : un seul candidat", () => {
    expect(resolveSubscriptionIdCandidates({ inputId: "sub-1", knownId: "sub-1" })).toEqual(["sub-1"]);
  });

  it("les deux sont fournis et diffèrent : l'input d'abord, l'id connu en repli", () => {
    expect(resolveSubscriptionIdCandidates({ inputId: "sub-input", knownId: "sub-known" })).toEqual([
      "sub-input",
      "sub-known",
    ]);
  });

  it("ignore les chaînes vides ou faites uniquement d'espaces", () => {
    expect(resolveSubscriptionIdCandidates({ inputId: "   ", knownId: "sub-known" })).toEqual(["sub-known"]);
    expect(resolveSubscriptionIdCandidates({ inputId: "sub-1", knownId: "   " })).toEqual(["sub-1"]);
  });

  it("trim les espaces superflus autour d'un id valide", () => {
    expect(resolveSubscriptionIdCandidates({ inputId: "  sub-1  " })).toEqual(["sub-1"]);
  });
});
