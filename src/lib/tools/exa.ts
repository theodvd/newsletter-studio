import Exa from "exa-js";

/**
 * Recherche de sources via Exa :
 * - exaSearch : recherche sémantique de sources d'information sur un sujet
 * - exaFindSimilar : « trouve des sites similaires à X » (point fort d'Exa)
 */
function getExa(): Exa {
  if (!process.env.EXA_API_KEY) throw new Error("EXA_API_KEY manquant dans .env");
  return new Exa(process.env.EXA_API_KEY);
}

export type ExaResult = { title: string | null; url: string; snippet: string | null };

export async function exaSearch(query: string): Promise<ExaResult[]> {
  const exa = getExa();
  const res = await exa.searchAndContents(query, {
    numResults: 10,
    text: { maxCharacters: 300 },
  });
  return res.results.map((r) => ({ title: r.title, url: r.url, snippet: r.text ?? null }));
}

export async function exaFindSimilar(url: string): Promise<ExaResult[]> {
  const exa = getExa();
  const res = await exa.findSimilarAndContents(url, {
    numResults: 6,
    excludeSourceDomain: true,
    text: { maxCharacters: 300 },
  });
  return res.results.map((r) => ({ title: r.title, url: r.url, snippet: r.text ?? null }));
}
