// ─────────────────────────────────────────────────────────────────────────────
// NODE : "Parser et filtrer" : remplacement complet
// Correctifs appliqués :
//   Bug 1 : items sans date contournaient le filtre de fraîcheur
//   Bug 3 : normalizeUrl ne gérait pas http/https ni www → doublons
//   Nouveau : dédup intra-run par titre (titleKey)
//   Nouveau : chaque item émis porte url_norm et title_key pour la suite
// ─────────────────────────────────────────────────────────────────────────────

const config = $('Charger la config').first().json;
const sourcesMeta = $('Préparer les sources').all().map(i => i.json);
const responses = $input.all();

// ── Fenêtre de fraîcheur selon la fréquence d'envoi ──────────────────────────
// CORRIGÉ : l'ancienne version classait "0 8 * * 1-5" (quotidien en semaine)
// comme HEBDO (test naïf dow !== '*') → fenêtre de 8 jours au lieu de 30h,
// d'où les vieux articles dans les digests quotidiens. On raisonne maintenant
// en envois/semaine, en développant les plages (1-5 = 5 jours).
function lookbackHours(cron) {
  const parts = String(cron || '').trim().split(/\s+/);
  const hours = parts[1] || '7';
  const dow   = parts[4] || '*';

  const runsPerDay = hours.split(',').length;
  let daysPerWeek = 7;
  if (dow !== '*') {
    daysPerWeek = dow.split(',').reduce((acc, p) => {
      const m = p.match(/^(\d+)-(\d+)$/);
      return acc + (m ? (parseInt(m[2]) - parseInt(m[1]) + 1) : 1);
    }, 0);
  }
  const runsPerWeek = runsPerDay * daysPerWeek;

  if (runsPerWeek >= 10) return 14;      // 2x/jour
  if (runsPerWeek >= 5) {
    // Quotidien : 30h, sauf le lundi d'une veille lun-ven où on couvre
    // le week-end écoulé (sinon les news de samedi/dimanche sont perdues).
    const isMondayWeekdaysOnly = new Date().getDay() === 1 && !/[06]/.test(dow);
    return isMondayWeekdaysOnly ? 78 : 30;
  }
  if (runsPerWeek >= 2) return 4 * 24;   // bi-hebdo
  return 8 * 24;                         // hebdo
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

// ── normalizeUrl ancienne version (pour compatibilité historique) ─────────────
// Correspond exactement à ce que le moteur stockait avant cette migration.
function normalizeUrlLegacy(rawUrl) {
  return String(rawUrl || '').replace(/[?#].*$/, '').replace(/\/$/, '');
}

// ── Construire le set des URLs déjà envoyées (triple clé) ────────────────────
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
    // Décode les entités HTML courantes : les flux RSS encodent les URLs
    // (&amp; dans les query strings) et les titres : sans décodage, les
    // params de tracking ne sont pas reconnus et la dédup se dérègle.
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
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
        if (lbHours <= 48) continue; // rejeté : pas de date, fenêtre courte
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
    // Uniquement pour les sources DÉCLARÉES scrape : si une source RSS
    // renvoie un body non-XML, c'est un échec de fetch (ex. 502 HTML),
    // pas un contenu : on la saute au lieu d'en faire un faux article.
    if (meta.source_type !== 'scrape') return;

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
    ', lookback ' + lbHours + 'h). Fin sans envoi, pas de fallback sur le vieux contenu.'
  );
  return [];
}

console.log('Veille Engine: ' + articles.length + ' articles candidats (cutoff ' + cutoff.toISOString() + ').');
return articles.map(a => ({ json: a }));
