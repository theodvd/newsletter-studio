// ═══════════════════════════════════════════════════════════════
// GROWFIN — Parser le XML (Nœud 4)
// Extraction des articles + filtre de fraîcheur (4 derniers jours)
// Top 5 articles par feed, uniquement ceux publiés récemment
// ═══════════════════════════════════════════════════════════════

// Fenêtre de fraîcheur : 4 jours (couvre lundi→jeudi ou jeudi→lundi + marge)
const FRESHNESS_DAYS = 4;
const now = new Date();
const cutoffDate = new Date(now.getTime() - (FRESHNESS_DAYS * 24 * 60 * 60 * 1000));

/**
 * Tente de parser une date depuis différents formats RSS
 * Retourne un objet Date ou null si impossible
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;

  // Nettoyage
  const cleaned = dateStr.trim();

  // Format RFC 2822 (RSS standard) : "Mon, 03 Mar 2026 14:30:00 GMT"
  const rfc2822 = new Date(cleaned);
  if (!isNaN(rfc2822.getTime())) return rfc2822;

  // Format ISO 8601 : "2026-03-03T14:30:00Z"
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    const iso = new Date(cleaned);
    if (!isNaN(iso.getTime())) return iso;
  }

  return null;
}

const results = [];

for (const item of $input.all()) {
  if (!item.json.data || typeof item.json.data !== 'string') continue;

  const xml = item.json.data;
  const topic = item.json.topic;

  try {
    // Extraction du titre du feed
    const feedTitleMatch = xml.match(/<channel[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/);
    const feedTitle = feedTitleMatch
      ? feedTitleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim()
      : "";

    // Extraction de tous les <item> (RSS) ou <entry> (Atom)
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/g)
                     || xml.match(/<entry[\s\S]*?<\/entry>/g)
                     || [];

    const articles = [];

    for (const itemXml of itemMatches) {
      // Helper pour extraire un tag
      const get = (tag) => {
        const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        if (!match) return "";
        return match[1]
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
          .replace(/<[^>]+>/g, '')
          .trim();
      };

      // Extraire les champs
      const title = get('title');
      if (!title) continue;

      const pubDateStr = get('pubDate') || get('published') || get('updated') || get('dc:date');
      const pubDate = parseDate(pubDateStr);

      // ── FILTRE FRAÎCHEUR ──
      // Si on a une date et qu'elle est trop ancienne → skip
      if (pubDate && pubDate < cutoffDate) continue;

      const summary = get('description') || get('summary') || get('content');

      // Extraire le lien (gestion Atom : <link href="..."/>)
      let url = get('link') || get('guid');
      if (!url) {
        const linkHref = itemXml.match(/<link[^>]+href=["']([^"']+)["']/);
        if (linkHref) url = linkHref[1];
      }

      articles.push({
        title,
        url,
        summary: summary.substring(0, 500), // Tronquer les résumés trop longs
        source: feedTitle,
        topic,
        pubDate: pubDateStr,
        // Flag si la date n'a pas pu être parsée (pour debug)
        dateConfidence: pubDate ? 'confirmed' : 'unknown',
      });

      // Top 5 par feed
      if (articles.length >= 5) break;
    }

    results.push(...articles);

  } catch(e) {
    console.log(`Erreur parsing feed (${topic}): ${e.message}`);
  }
}

// Log pour debug
const confirmed = results.filter(a => a.dateConfidence === 'confirmed').length;
const unknown = results.filter(a => a.dateConfidence === 'unknown').length;
console.log(`Growfin parser: ${results.length} articles retenus (${confirmed} date confirmée, ${unknown} date inconnue, cutoff: ${cutoffDate.toISOString()})`);

return results.map(a => ({ json: a }));
