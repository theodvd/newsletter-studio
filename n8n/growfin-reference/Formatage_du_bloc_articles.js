// ═══════════════════════════════════════════════════════════════
// GROWFIN — Formatage du bloc articles (Nœud 5)
// Groupe les articles par topic et formate pour le prompt Claude
// Inclut la date de publication pour le filtre de fraîcheur
// ═══════════════════════════════════════════════════════════════

const articles = $input.all().map(item => item.json);

// Grouper par thématique
const grouped = { fintech: [], growth: [], ai: [] };
for (const article of articles) {
  const topic = article.topic || 'ai';
  if (grouped[topic]) grouped[topic].push(article);
}

// Formater chaque article (avec date)
const formatArticle = (a, index) => {
  const dateLine = a.pubDate
    ? `Date: ${a.pubDate} (${a.dateConfidence || 'unknown'})`
    : `Date: non disponible`;

  return `[${index + 1}] ${a.title}
Source: ${a.source}
${dateLine}
URL: ${a.url}
Résumé: ${a.summary?.slice(0, 300) || "Pas de résumé disponible"}`;
};

// Construire le bloc final
let bloc = `[ARTICLES_COLLECTES — ${articles.length} articles]\n\n`;

bloc += `== FINTECH & NÉOBANQUES (${grouped.fintech.length} articles) ==\n`;
grouped.fintech.forEach((a, i) => { bloc += formatArticle(a, i) + '\n\n'; });

bloc += `== GROWTH & TECH BUSINESS (${grouped.growth.length} articles) ==\n`;
grouped.growth.forEach((a, i) => { bloc += formatArticle(a, i) + '\n\n'; });

bloc += `== AI & AGENTS (${grouped.ai.length} articles) ==\n`;
grouped.ai.forEach((a, i) => { bloc += formatArticle(a, i) + '\n\n'; });

return [{ json: {
  articles_bloc: bloc,
  date_edition: new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  article_count: articles.length
}}];
