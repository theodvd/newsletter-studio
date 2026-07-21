// ─────────────────────────────────────────────────────────────────────────────
// NODE : "Préparer le log" : remplacement complet
// Correctifs appliqués :
//   Bug 2 partiellement (le noeud lui-même) : items_rows construit avec
//          l'URL d'ORIGINE du flux (pas l'URL sortie Claude), url_hash et
//          url_norm calculés avec normalizeUrl robuste, title et title_key remplis.
//   Bug 3 : url stockée = URL flux via correspondance url_norm ↔ url_norm Claude
// ─────────────────────────────────────────────────────────────────────────────

const v        = $('Valider la réponse').first().json;
const sendResp = $input.first().json;

// Détection d'échec d'envoi, deux formes possibles :
// - Bot Slack : HTTP 200 mais ok=false dans le JSON
// - Node en "Continue (using regular output)" : l'échec HTTP (Brevo, webhook…)
//   arrive ici comme item portant un champ `error`
const httpFailure = sendResp && sendResp.error
  ? ('Send failed: ' + (sendResp.error.message || String(JSON.stringify(sendResp.error)).slice(0, 200)))
  : null;
const slackError = sendResp && sendResp.ok === false
  ? ('Slack: ' + sendResp.error)
  : httpFailure;

// ── Même normalizeUrl que dans "Parser et filtrer" ───────────────────────────
// (copiée ici car les nodes Code n8n ne partagent pas de modules)
const TRACKING_PARAMS = new Set([
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  'utm_id','utm_source_platform','utm_creative_format','utm_marketing_tactic',
  'fbclid','gclid','msclkid','twclid','li_fat_id',
  'mc_cid','mc_eid','ref','source','campaign','cid',
  '_ga','_gl','igshid','yclid','zanpid','dclid',
  'srsltid','epik','pk_source','pk_medium','pk_campaign',
]);

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  // Parsing manuel par regex : le sandbox des nodes Code n8n n'expose pas
  // new URL() ni URLSearchParams (une version precedente les utilisait et
  // toutes les URLs ressortaient null, donc 0 article retenu).
  const s = String(rawUrl).trim();
  const m = s.match(/^https?:\/\/([^\/?#]+)([^?#]*)(?:\?([^#]*))?/i);
  if (!m) return null;

  let host = m[1].toLowerCase();
  if (host.indexOf('@') !== -1) host = host.slice(host.indexOf('@') + 1);
  if (host.startsWith('www.')) host = host.slice(4);
  if (host.startsWith('amp.')) host = host.slice(4);

  let path = m[2] || '';
  path = path.replace(/\/amp\/?$/, '').replace(/\/amp\//, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  // Query string : retire les params de tracking, trie le reste (canonique)
  let query = '';
  if (m[3]) {
    const kept = {};
    for (const pair of m[3].split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const kLow = k.toLowerCase();
      if (TRACKING_PARAMS.has(kLow) || kLow.indexOf('utm_') === 0) continue;
      kept[k] = eq === -1 ? '' : pair.slice(eq + 1);
    }
    const keys = Object.keys(kept).sort();
    if (keys.length) {
      query = '?' + keys.map(k => (kept[k] === '' ? k : k + '=' + kept[k])).join('&');
    }
  }
  return 'https://' + host + path + query;
}

// ── Même titleKey que dans "Parser et filtrer" ───────────────────────────────
const STOPWORDS = new Set([
  'le','la','les','un','une','des','de','du','en','et','au','aux','a',
  'the','a','an','of','in','for','on','with','by','is','are','was',
  'que','qui','dans','sur','par','pour','ou','si','car','mais','donc',
]);

function titleKey(title) {
  if (!title) return null;
  const words = String(title)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  return words.slice(0, 5).sort().join(' ');
}

// ── Construire un index url_norm → article RSS d'origine ─────────────────────
// Les items parsés par "Parser et filtrer" ont été propagés jusqu'ici via
// "Construire le prompt" et "Appel Claude". On les récupère depuis le node
// en amont pour retrouver l'URL flux d'origine.
//
// On construit un Map : url_norm_rss → item parsé (url brute, title, title_key)
// afin de matcher chaque URL sortie par Claude avec son original de flux.
let parsedItemsByNorm = new Map();
try {
  const parsedItems = $('Parser et filtrer').all().map(i => i.json);
  for (const p of parsedItems) {
    if (p.url_norm) parsedItemsByNorm.set(p.url_norm, p);
    // Fallback : normalise l'url brute si url_norm absent (items anciens)
    else if (p.url) {
      const n = normalizeUrl(p.url);
      if (n) parsedItemsByNorm.set(n, p);
    }
  }
} catch (_) {
  // Si le node n'est pas accessible (exécution partielle), on continue
  // sans correspondance : items_rows utilisera l'URL Claude comme fallback.
}

// ── Construire items_rows ─────────────────────────────────────────────────────
// Pour chaque URL que Claude retourne dans le digest :
//   1. On calcule url_norm de l'URL Claude.
//   2. On cherche l'article RSS d'origine correspondant (via url_norm matching).
//   3. On stocke l'URL flux d'origine si trouvée, sinon l'URL Claude (fallback).
//   4. url_hash = url_norm (= la clé de dédup canonique).
//   5. title et title_key depuis l'article RSS d'origine si dispo.
const items_rows = (v.digest.items || [])
  .map(i => i.url)
  .filter(Boolean)
  .map(claudeUrl => {
    const claudeNorm = normalizeUrl(claudeUrl);
    // Cherche le correspondant RSS
    const rssMatch = claudeNorm ? parsedItemsByNorm.get(claudeNorm) : null;

    // URL à stocker : flux RSS d'origine si trouvé, sinon URL Claude
    const urlToStore = rssMatch ? rssMatch.url : claudeUrl;
    // url_norm à stocker : toujours calculée sur l'URL à stocker
    const urlNorm = normalizeUrl(urlToStore) || claudeNorm;

    // Titre depuis le digest Claude (source la plus riche à ce stade)
    const claudeItem = (v.digest.items || []).find(i => i.url === claudeUrl);
    const titleVal   = claudeItem ? (claudeItem.title || '') : '';
    const tKey       = rssMatch ? rssMatch.title_key : titleKey(titleVal);

    return {
      subscription_id: v.subscription_id,
      url:             urlToStore,
      url_hash:        urlNorm,   // clé de dédup canonique
      url_norm:        urlNorm,
      title:           titleVal,
      title_key:       tKey || null,
    };
  });

return {
  delivery: {
    subscription_id: v.subscription_id,
    status:          slackError ? 'error' : 'success',
    items:           v.digest.items,
    error:           slackError,
  },
  items_rows,
  langfuse_meta: {
    subject:         v.subject,
    date_edition:    v.date_edition,
    subscription_id: v.subscription_id,
    input_tokens:    v.input_tokens,
    output_tokens:   v.output_tokens,
    digest:          JSON.stringify(v.digest).substring(0, 5000),
  },
};
