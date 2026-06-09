// ═══════════════════════════════════════════════════════════════
// GROWFIN — Code in JavaScript3 (Nœud 9)
// Convertit le JSON Claude en HTML email-compatible
// Input: $input.first().json.newsletter (string JSON)
//        $input.first().json.date_edition (string)
// Output: { html: "..." } pour le nœud Brevo
// ═══════════════════════════════════════════════════════════════

const raw = $input.first().json.newsletter;
const dateEdition = $input.first().json.date_edition || '';

if (!raw) {
  throw new Error(
    'Le champ "newsletter" est absent de l\'input. ' +
    'Vérifie que le nœud Code8 (extract response) est bien connecté à ce nœud. ' +
    'Input reçu: ' + JSON.stringify(Object.keys($input.first().json))
  );
}

// Parse le JSON (avec nettoyage si Claude ajoute des backticks)
let data;
try {
  const cleaned = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
  data = JSON.parse(cleaned);
} catch (e) {
  throw new Error(`JSON parse error: ${e.message}\nRaw content: ${(raw || '').substring(0, 500)}`);
}

// ── Couleurs ──
const C = {
  emerald900: '#064E3B',
  emerald700: '#047857',
  emerald600: '#059669',
  emerald500: '#10B981',
  stone900: '#1C1917',
  stone700: '#44403C',
  stone500: '#78716C',
  stone400: '#A8A29E',
  stone300: '#D6D3D1',
  stone200: '#E7E5E3',
  stone100: '#F5F5F4',
  stone50: '#FAFAF9',
  white: '#FFFFFF',
  red100: '#FEE2E2',
  red600: '#DC2626',
  green100: '#DCFCE7',
  green600: '#16A34A',
  blue100: '#DBEAFE',
  blue700: '#1D4ED8',
  purple100: '#F3E8FF',
  purple700: '#7C3AED',
  amber100: '#FEF3C7',
  amber700: '#B45309',
  pink100: '#FCE7F3',
  pink700: '#BE185D',
};

// ── Tag colors ──
const tagColors = {
  fintech:    { bg: C.blue100, color: C.blue700 },
  ai:         { bg: C.purple100, color: C.purple700 },
  growth:     { bg: C.amber100, color: C.amber700 },
  tech:       { bg: C.amber100, color: C.amber700 },
  crypto:     { bg: C.green100, color: C.green600 },
  regulation: { bg: C.red100, color: C.red600 },
};

// ── Helpers ──
function tag(label, type) {
  const t = type.toLowerCase();
  const colors = tagColors[t] || { bg: C.stone100, color: C.stone700 };
  return `<span style="display:inline-block;font-family:'Courier New',monospace;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:3px 10px;border-radius:3px;background:${colors.bg};color:${colors.color};">${label.toUpperCase()}</span>`;
}

function sectionHeader(label, title) {
  return `
  <tr><td style="padding:36px 32px 0 32px;">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:4px;background:${C.emerald600};border-radius:2px;" width="4">&nbsp;</td>
      <td style="padding-left:12px;">
        <div style="font-family:'Courier New',monospace;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${C.emerald700};background:rgba(5,150,105,0.08);padding:3px 10px;border-radius:3px;display:inline-block;font-weight:500;margin-bottom:4px;">${label}</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:${C.stone900};letter-spacing:-0.3px;line-height:1.3;">${title}</div>
      </td>
    </tr></table>
  </td></tr>`;
}

function separator() {
  return `<tr><td style="padding:0 32px;"><div style="border-bottom:1px solid ${C.stone200};"></div></td></tr>`;
}

// ── Section emojis for menu ──
const menuItems = [
  { emoji: '📡', label: 'Le Radar' },
  { emoji: '🔬', label: 'Le Deep Dive' },
  { emoji: '⚡', label: 'Le Signal' },
  { emoji: '📊', label: 'Le Chiffre' },
  { emoji: '⭐', label: 'La Reco' },
  { emoji: '🎒', label: 'Vrac' },
];

// ═══════════════════════════════════════
// BUILD HTML
// ═══════════════════════════════════════

let html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Growfin — ${dateEdition}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    body, table, td { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    body { margin: 0; padding: 0; background-color: ${C.stone200}; }
    table { border-spacing: 0; border-collapse: collapse; }
    img { border: 0; display: block; }
    a { color: ${C.emerald700}; text-decoration: none; }
    @media only screen and (max-width: 660px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .menu-cell { display: block !important; width: 100% !important; padding-bottom: 6px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.stone200};">
<center>

<!-- Preheader (hidden text for inbox preview) -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.stone200};">
  ${(data.intro?.text || '').replace(/<[^>]*>/g, '').substring(0, 120) || 'Growfin — Fintech, Growth & AI'}
</div>

<!-- Email Container -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="email-container" style="max-width:640px;margin:0 auto;background:${C.stone50};">

  <!-- ═══ HEADER ═══ -->
  <tr>
    <td style="background:${C.emerald900};padding:40px 32px 36px;text-align:center;" bgcolor="${C.emerald900}">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:36px;color:${C.white};letter-spacing:-0.5px;">Grow<span style="color:${C.emerald500};">fin</span></div>
      <div style="font-size:13px;color:rgba(255,255,255,0.55);letter-spacing:2.5px;text-transform:uppercase;font-weight:500;margin-top:2px;">Fintech · Growth · AI</div>
      <div style="margin-top:20px;">
        <span style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:100px;padding:6px 18px;font-family:'Courier New',monospace;font-size:13px;color:rgba(255,255,255,0.7);font-weight:500;">${dateEdition}</span>
      </div>
    </td>
  </tr>

  <!-- ═══ INTRO ═══ -->
  <tr>
    <td style="padding:32px 32px 28px;" class="mobile-padding">
      <p style="font-size:15.5px;color:${C.stone700};line-height:1.75;margin:0 0 16px 0;">${data.intro?.text || ''}</p>
      <p style="font-size:14px;color:${C.stone500};font-style:italic;margin:0;">— ${data.intro?.signature || 'La rédaction Growfin'}</p>
    </td>
  </tr>
  ${separator()}

  <!-- ═══ MENU ═══ -->
  <tr>
    <td style="padding:24px 32px;background:${C.stone100};" bgcolor="${C.stone100}" class="mobile-padding">
      <div style="font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${C.stone500};font-weight:500;margin-bottom:14px;">Au sommaire</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          ${menuItems.slice(0, 3).map(item => `
          <td class="menu-cell" width="33%" style="padding:4px;">
            <div style="background:${C.white};border:1px solid ${C.stone200};border-radius:6px;padding:10px 12px;font-size:13px;font-weight:500;color:${C.stone700};">
              ${item.emoji} ${item.label}
            </div>
          </td>`).join('')}
        </tr>
        <tr>
          ${menuItems.slice(3, 6).map(item => `
          <td class="menu-cell" width="33%" style="padding:4px;">
            <div style="background:${C.white};border:1px solid ${C.stone200};border-radius:6px;padding:10px 12px;font-size:13px;font-weight:500;color:${C.stone700};">
              ${item.emoji} ${item.label}
            </div>
          </td>`).join('')}
        </tr>
      </table>
    </td>
  </tr>
  ${separator()}

  <!-- ═══ LE RADAR ═══ -->
  ${sectionHeader('Le Radar', '3 signaux à capter cette semaine')}
  <tr><td style="padding:24px 32px 32px;" class="mobile-padding">
    ${(data.radar || []).map((item, i) => {
      const isLast = i === (data.radar || []).length - 1;
      return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:${isLast ? '0' : '28px'};${isLast ? '' : 'padding-bottom:28px;border-bottom:1px dashed ' + C.stone300 + ';'}">
      <tr><td>
        ${tag(item.tag, item.tag)}
        <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:${C.stone900};margin:10px 0;letter-spacing:-0.2px;line-height:1.35;">${item.title}</h3>
        ${(item.paragraphs || []).map(p => `<p style="font-size:15px;color:${C.stone700};line-height:1.75;margin:0 0 10px 0;">${p}</p>`).join('')}
        ${item.takeaway ? `
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">
          <tr>
            <td style="background:${C.stone100};border-radius:8px;padding:12px 16px;">
              <table cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="vertical-align:top;padding-right:10px;font-size:14px;">💡</td>
                <td style="font-size:14px;color:${C.stone700};line-height:1.6;">${item.takeaway}</td>
              </tr></table>
            </td>
          </tr>
        </table>` : ''}
      </td></tr>
    </table>`;
    }).join('')}
  </td></tr>
  ${separator()}

  <!-- ═══ LE DEEP DIVE ═══ -->
  ${sectionHeader('Le Deep Dive', data.deep_dive?.title || '')}
  <tr><td style="padding:24px 32px 32px;" class="mobile-padding">
    ${(data.deep_dive?.sections || []).map(section => {
      let sectionHtml = '';
      if (section.subtitle) {
        sectionHtml += `<h3 style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:${C.stone900};margin:24px 0 10px 0;">${section.subtitle}</h3>`;
      }
      sectionHtml += (section.paragraphs || []).map(p =>
        `<p style="font-size:15.5px;color:${C.stone700};line-height:1.78;margin:0 0 16px 0;">${p}</p>`
      ).join('');
      return sectionHtml;
    }).join('')}

    ${data.deep_dive?.highlight ? `
    <!-- Highlight box -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;">
      <tr>
        <td style="border-left:3px solid ${C.emerald600};background:${C.stone100};padding:16px 20px;border-radius:0 8px 8px 0;">
          <p style="font-size:14.5px;color:${C.stone700};line-height:1.7;margin:0;">${data.deep_dive.highlight}</p>
        </td>
      </tr>
    </table>` : ''}

    ${data.deep_dive?.tldr ? `
    <!-- TL;DR box -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
      <tr>
        <td style="background:${C.emerald900};padding:20px 24px;border-radius:8px;" bgcolor="${C.emerald900}">
          <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.emerald500};font-weight:500;margin-bottom:8px;">En clair</div>
          <p style="font-size:14.5px;color:rgba(255,255,255,0.88);line-height:1.7;margin:0;">${data.deep_dive.tldr}</p>
        </td>
      </tr>
    </table>` : ''}
  </td></tr>
  ${separator()}

  <!-- ═══ LE SIGNAL ═══ -->
  ${sectionHeader('Le Signal', 'À retenir en 30 secondes')}
  <tr><td style="padding:24px 32px 32px;" class="mobile-padding">
    ${(data.signal || []).map((item, i) => {
      const isFirst = i === 0;
      const isLast = i === (data.signal || []).length - 1;
      return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="${isFirst ? '' : 'padding-top:20px;'}${isLast ? '' : 'padding-bottom:20px;border-bottom:1px dashed ' + C.stone300 + ';'}">
      <tr><td>
        ${tag(item.tag, item.tag)}
        <h4 style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:15.5px;font-weight:700;color:${C.stone900};margin:8px 0;line-height:1.4;">${item.title}</h4>
        <p style="font-size:14.5px;color:${C.stone700};line-height:1.7;margin:0;">${item.text}</p>
      </td></tr>
    </table>`;
    }).join('')}
  </td></tr>
  ${separator()}

  <!-- ═══ LE CHIFFRE ═══ -->
  ${sectionHeader('Le Chiffre', 'Le nombre de la semaine')}
  <tr><td style="padding:24px 32px 32px;" class="mobile-padding">

    <!-- Big number -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td style="background:${C.emerald900};padding:32px 24px;border-radius:12px;text-align:center;" bgcolor="${C.emerald900}">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:52px;color:${C.white};letter-spacing:-1px;line-height:1.1;">${data.chiffre?.value || ''}</div>
          <div style="font-size:15px;color:${C.emerald500};font-weight:500;margin-top:6px;">${data.chiffre?.label || ''}</div>
        </td>
      </tr>
    </table>

    ${(data.chiffre?.context || []).map(p =>
      `<p style="font-size:15px;color:${C.stone700};line-height:1.75;margin:0 0 12px 0;">${p}</p>`
    ).join('')}

    ${data.chiffre?.quote ? `
    <!-- Quote -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
      <tr>
        <td style="background:${C.stone100};padding:28px 24px;border-radius:12px;text-align:center;" bgcolor="${C.stone100}">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:48px;color:${C.emerald500};line-height:1;">"</div>
          <p style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${C.stone900};line-height:1.5;font-style:italic;margin:8px 0 0 0;">${data.chiffre.quote.text}</p>
          <p style="font-size:13px;color:${C.stone500};margin:12px 0 0 0;">— ${data.chiffre.quote.author}</p>
        </td>
      </tr>
    </table>` : ''}
  </td></tr>
  ${separator()}

  <!-- ═══ LA RECO ═══ -->
  ${sectionHeader('La Reco', 'À lire cette semaine')}
  <tr><td style="padding:24px 32px 32px;" class="mobile-padding">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${C.stone200};border-radius:10px;">
      <tr>
        <td style="padding:24px;">
          <div style="margin-bottom:14px;">
            <span style="font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${C.amber700};font-weight:500;background:${C.amber100};padding:3px 10px;border-radius:3px;">${data.reco?.type || 'Article'}</span>
          </div>
          <h4 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${C.stone900};margin:0 0 10px 0;line-height:1.35;">${data.reco?.title || ''}</h4>
          ${(data.reco?.paragraphs || []).map(p =>
            `<p style="font-size:14.5px;color:${C.stone700};line-height:1.7;margin:0 0 10px 0;">${p}</p>`
          ).join('')}
          <p style=\"font-size:13px;color:${C.stone500};font-style:italic;margin:0 0 16px 0;\">${data.reco?.source || ''}</p>
          ${data.reco?.url ? `<a href="${data.reco.url}" style="display:inline-block;background:${C.emerald900};color:${C.white};font-size:13px;font-weight:600;padding:10px 20px;border-radius:6px;text-decoration:none;font-family:'DM Sans',Helvetica,Arial,sans-serif;">Lire l'article →</a>` : ''}
        </td>
      </tr>
    </table>
  </td></tr>
  ${separator()}

  <!-- ═══ VRAC ═══ -->
  ${sectionHeader('Vrac', 'En passant')}
  <tr><td style="padding:24px 32px 32px;" class="mobile-padding">
    ${(data.vrac || []).map((item, i) => {
      const isLast = i === (data.vrac || []).length - 1;
      const isFirst = i === 0;
      return `<div style="${isFirst ? '' : 'padding-top:14px;'}${isLast ? '' : 'padding-bottom:14px;border-bottom:1px solid ' + C.stone200 + ';'}">
        <p style="font-size:14.5px;color:${C.stone700};line-height:1.65;margin:0;">${item.text}</p>
      </div>`;
    }).join('')}
  </td></tr>

  <!-- ═══ FOOTER ═══ -->
  <tr>
    <td style="background:${C.stone900};padding:36px 32px;text-align:center;" bgcolor="${C.stone900}">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:${C.white};margin-bottom:8px;">Grow<span style="color:${C.emerald500};">fin</span></div>
      <p style="font-size:12.5px;color:${C.stone500};line-height:1.6;margin:0 0 4px 0;">Fintech, growth & AI — deux fois par semaine dans ta boîte.</p>
      <div style="width:40px;height:1px;background:${C.stone700};margin:16px auto;"></div>
      <p style="font-size:12.5px;color:${C.stone500};line-height:1.6;margin:0 0 4px 0;">Tu as aimé ? Transfère Growfin à quelqu'un qui devrait lire ça.</p>
      <p style="font-size:12.5px;margin:12px 0 0 0;"><a href="{{unsubscribe}}" style="color:${C.emerald500};text-decoration:none;">Se désabonner</a></p>
    </td>
  </tr>

</table>
</center>
</body>
</html>`;

return { html, date_edition: dateEdition };
