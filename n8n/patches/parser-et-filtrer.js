// ─────────────────────────────────────────────────────────────────────────────
// NODE : "Parser et filtrer"  — remplacement complet
// Correctifs appliqués :
//   Bug 1 — items sans date contournaient le filtre de fraîcheur
//   Bug 3 — normalizeUrl ne gérait pas http/https ni www → doublons
//   Nouveau — dédup intra-run par titre (titleKey)
//   Nouveau — chaque item émis porte url_norm et title_key pour la suite
// ─────────────────────────────────────────────────────────────────────────────

const config = $('Charger la config').first().json;
const sourcesMeta = $('Préparer les sources').all().map(i => i.json);
const responses = $input.all();

// ── Fenêtre de fraîcheur selon la fréquence d'envoi ──────────────────────────
function lookbackHours(cron) {
  const parts = String(cron || '').trim().split(/\s+/);
  const hours = parts[1] || '7';
  const dow   = parts[4] || '*';
  if (dow !== '*') {
    // Envoi hebdo → 8 jours, bi-hebdo → 4 jours
    return dow.split(',').length <= 1 ? 8 * 24 : 4 * 24;
  }
  if (hours.includes(',')) return 14; // 2x/jour
  return 30;                          // quotidien
}
const lbHours = lookbackHours(config.frequency_cron);
const cutoff  = new Date(Date.now() - lbHours * 3600 * 1000);

// ── Paramètres de tracking à supprimer de l'URL ──────────────────────────────
const TRACKING_PARAMS = new Set([
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  'utm_id','utm_source_platform','utm_creative_format','utm_marketing_tactic',
  'fbclid','gclid','msclkid','twclid','li_fat_id',
  'mc_cid','mc_eid','ref','source','campaign','cid',
  '_ga','_gl','igshid','yclid','zanpid','dclid',
  'srsltid','epik','pk_source','pk_medium','pk_campaign',
]);

// ── normalizeUrl robuste ──────────────────────────────────────────────────────
// - force https
// - strip www. et amp.
// - supprime les params de tracking, garde les params signifiants triés
// - supprime fragment et trailing slash
// Retourne null si l'URL est malformée.
function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(String(rawUrl).trim());
    u.protocol = 'https:';
    u.hash = '';
    // Strip www. et amp.
    if (u.hostname.startsWith('www.')) u.hostname = u.hostname.slice(4);
    if (u.hostname.startsWith('amp.'))  u.hostname = u.hostname.slice(4);
    // Strip /amp/ dans le path
    u.pathname = u.pathname
      .replace(/\/amp\/?$/, '')
      .replace(/\/amp\//, '/');
    // Trailing slash sauf root
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    // Filtrer params tracking, trier les restants pour canonicalisation
    const clean = new URLSearchParams();
    const sorted = [...u.searchParams.keys()]
      .filter(k => !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort();
    for (const k of sorted) clean.set(k, u.searchParams.get(k));
    u.search = clean.toString();
    return u.toString();
  } catch (_) {
    return null;
  }
}

// ── normalizeUrl ancienne version (pour compatibilité historique) ─────────────
// Correspond exactement à ce que le moteur stockait avant cette migration.
function normalizeUrlLegacy(rawUrl) {
  return String(rawUrl || '').replace(/[?#].*$/, '').replace(/\/$/, '');
}

// ── Construire le set des URLs déjà envoyées — triple clé ────────────────────
// On compare sur trois formes pour ne rater ni l'ancien ni le nouveau format :
//   1. url_hash tel que stocké (normalisé nouvelle fonction, déjà en base)
//   2. normalizeUrlLegacy(d.url)  → ancien format
//   3. normalizeUrl(d.url)        → au cas où d.url est une URL Claude reçue
const alreadySent = new Set();
// Historique des title_key déjà envoyés (chargé si dispo dans la config)
const sentTitleKeys = new Set();

for (const d of (config.delivered_items || [])) {
  // Clé 1 : url_hash stocké
  if (d.url_hash) alreadySent.add(d.url_hash);
  // Clé 2 : ancienne normalisation sur l'URL brute
  if (d.url) alreadySent.add(normalizeUrlLegacy(d.url));
  // Clé 3 : nouvelle normalisation sur l'URL brute
  const norm3 = normalizeUrl(d.url);
  if (norm3) alreadySent.add(norm3);
  // title_key historiques
  if (d.title_key) sentTitleKeys.add(d.title_key);
}

// ── titleKey : empreinte de titre pour dédup sémantique intra-run ─────────────
const STOPWORDS = new Set([
  'le','la','les','un','une','des','de','du','en','et','au','aux','a',
  'the','a','an','of','in','for','on','with','by','is','are','was',
  'que','qui','dans','sur','par','pour','ou','si','car','mais','donc',
]);

function titleKey(title) {
  if (!title) return null;
  const words = String(title)
    .toLowerCase()
    // Déaccenter
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Garder uniquement alphanumérique + espaces
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  // 5 premiers mots significatifs, triés pour résistance à la reformulation
  return words.slice(0, 5).sort().join(' ');
}

// ── Parsers utilitaires ───────────────────────────────────────────────────────
function parseDate(dateStr) {
  if (!dateStr || String(dateStr).trim() === '') return null;
  const d = new Date(String(dateStr).trim());
  return isNaN(d.getTime()) ? null : d;
}

function stripTags(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Traitement des sources ────────────────────────────────────────────────────
const articles = [];
// Set des url_norm et title_key déjà vus DANS CE RUN (dédup intra-run)
const seenNormInRun   = new Set();
const seenTitleInRun  = new Set();

responses.forEach((item, idx) => {
  const meta = sourcesMeta[idx] || {};
  const body = item.json.data || item.json.body || '';
  if (typeof body !== 'string' || !body) return;

  const isFeed = /<(rss|feed|rdf)[\s>]/i.test(body.substring(0, 2000));

  if (isFeed) {
    const xmlItems =
      body.match(/<item[\s\S]*?<\/item>/g) ||
      body.match(/<entry[\s\S]*?<\/entry>/g) ||
      [];
    let kept = 0;

    for (const itemXml of xmlItems) {
      const get = (tag) => {
        const m = itemXml.match(
          new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>')
        );
        return m ? stripTags(m[1]) : '';
      };

      const title = get('title');
      if (!title) continue;

      // ── Fraîcheur ────────────────────────────────────────────────
      const pubDateStr = get('pubDate') || get('published') || get('updated') || get('dc:date');
      const pubDate    = parseDate(pubDateStr);

      // Bug 1 corrigé : si lookback ≤ 48h (digest quotidien ou 2x/jour),
      // on REJETTE les items sans date parseable pour éviter les articles
      // épinglés / evergreen qui tournent en boucle.
      // Au-delà de 48h (hebdo), on accepte mais on tague "undated".
      if (!pubDate) {
        if (lbHours <= 48) continue; // rejeté — pas de date, fenêtre courte
        // Sinon : item sans date accepté avec tag undated (hebdo)
      } else {
        if (pubDate < cutoff) continue; // trop vieux
      }

      // ── URL brute depuis le flux ──────────────────────────────────
      let urlRaw = get('link') || get('guid');
      if (!urlRaw) {
        const m = itemXml.match(/<link[^>]+href=["']([^"']+)["']/);
        if (m) urlRaw = m[1];
      }
      if (!urlRaw) continue;

      const urlNorm = normalizeUrl(urlRaw);
      if (!urlNorm) continue; // URL malformée

      // ── Dédup inter-run (historique) ─────────────────────────────
      // On teste url_norm (nouvelle normalisation) ET le legacy sur l'URL brute
      if (
        alreadySent.has(urlNorm) ||
        alreadySent.has(normalizeUrlLegacy(urlRaw))
      ) continue;

      // ── Dédup intra-run par URL ───────────────────────────────────
      if (seenNormInRun.has(urlNorm)) continue;

      // ── Dédup inter-run par titre (title_key) ────────────────────
      const tKey = titleKey(title);
      if (tKey && sentTitleKeys.has(tKey)) continue;

      // ── Dédup intra-run par titre ─────────────────────────────────
      if (tKey && seenTitleInRun.has(tKey)) continue;

      // ── Accepté ──────────────────────────────────────────────────
      seenNormInRun.add(urlNorm);
      if (tKey) seenTitleInRun.add(tKey);

      articles.push({
        title,
        url:            urlRaw,   // URL d'origine du flux (pour remonter au log)
        url_norm:       urlNorm,  // URL normalisée (clé de dédup pour la suite)
        title_key:      tKey,
        summary:        (get('description') || get('summary') || get('content')).substring(0, 400),
        source:         meta.source_title,
        pubDate:        pubDateStr,
        dateConfidence: pubDate ? 'confirmed' : 'undated',
      });
      if (++kept >= 5) break;
    }
  } else {
    // ── Source HTML (type scrape) : extraction grossière ─────────────
    const urlRaw  = meta.source_url;
    const urlNorm = normalizeUrl(urlRaw);
    if (!urlNorm) return;

    // Dédup inter-run
    if (
      alreadySent.has(urlNorm) ||
      alreadySent.has(normalizeUrlLegacy(urlRaw))
    ) return;
    // Dédup intra-run
    if (seenNormInRun.has(urlNorm)) return;

    const titleRaw = stripTags(
      (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || meta.source_title
    );
    const tKey = titleKey(titleRaw);
    if (tKey && (sentTitleKeys.has(tKey) || seenTitleInRun.has(tKey))) return;

    seenNormInRun.add(urlNorm);
    if (tKey) seenTitleInRun.add(tKey);

    const desc = (body.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    ) || [])[1] || '';
    const text = stripTags(
      body
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
    ).substring(0, 1500);

    articles.push({
      title:          titleRaw,
      url:            urlRaw,
      url_norm:       urlNorm,
      title_key:      tKey,
      summary:        (desc + ' ' + text).substring(0, 800),
      source:         meta.source_title,
      pubDate:        '',
      dateConfidence: 'undated',
    });
  }
});

if (articles.length === 0) {
  // Pas assez d'items frais : on préfère un digest court (ou vide) à du
  // vieux contenu. Le moteur s'arrête ici sans envoyer.
  console.log(
    'Veille Engine: aucun article frais (cutoff ' + cutoff.toISOString() +
    ', lookback ' + lbHours + 'h). Fin sans envoi — pas de fallback sur le vieux contenu.'
  );
  return [];
}

console.log('Veille Engine: ' + articles.length + ' articles candidats (cutoff ' + cutoff.toISOString() + ').');
return articles.map(a => ({ json: a }));
