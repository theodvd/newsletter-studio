import { describe, expect, it } from "vitest";
import { injectBaseTarget } from "./base-target";

describe("injectBaseTarget", () => {
  it("insère le tag juste après <head>", () => {
    const html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head><body>hi</body></html>";
    const out = injectBaseTarget(html);
    expect(out).toContain('<head><base target="_blank"><meta charset="UTF-8">');
  });

  it("préserve les attributs de <head>", () => {
    const html = '<html><head data-x="1"><title>t</title></head><body></body></html>';
    const out = injectBaseTarget(html);
    expect(out).toContain('<head data-x="1"><base target="_blank">');
  });

  it("est insensible à la casse de la balise", () => {
    const html = "<HTML><HEAD><title>t</title></HEAD><body></body></HTML>";
    const out = injectBaseTarget(html);
    expect(out).toContain('<base target="_blank">');
  });

  it("crée un <head> quand il n'y en a pas mais qu'il y a un <html>", () => {
    const html = "<html><body>hi</body></html>";
    const out = injectBaseTarget(html);
    expect(out).toBe('<html><head><base target="_blank"></head><body>hi</body></html>');
  });

  it("préfixe simplement quand il n'y a ni <head> ni <html>", () => {
    const html = "<body>hi</body>";
    expect(injectBaseTarget(html)).toBe('<head><base target="_blank"></head><body>hi</body>');
  });

  it("n'altère pas le reste du document", () => {
    const html = "<html><head><style>a{color:red}</style></head><body><a href=\"x\">y</a></body></html>";
    const out = injectBaseTarget(html);
    expect(out).toContain("<style>a{color:red}</style>");
    expect(out).toContain('<a href="x">y</a>');
  });
});
