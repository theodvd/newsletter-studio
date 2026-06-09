// ═══════════════════════════════════════════════════════════════
// GROWFIN — Code in JavaScript2 (Nœud 8)
// Extrait la réponse Claude et valide le JSON
// Input: réponse brute de l'API Anthropic
// Output: { newsletter, date_edition }
// ═══════════════════════════════════════════════════════════════

const response = $input.first().json;

// 1. Vérifier si la réponse a été tronquée
const stopReason = response.stop_reason;
if (stopReason === 'max_tokens') {
  throw new Error(
    `TRONCATURE DÉTECTÉE: Claude a été coupé par la limite de tokens (max_tokens atteint). ` +
    `La réponse fait ${response.usage?.output_tokens || '?'} tokens. ` +
    `→ Solution : augmenter max_tokens dans le nœud 6 (actuellement il faut au moins 8000 pour une newsletter ~8 min).`
  );
}

// 2. Extraire le texte
const text = response.content?.[0]?.text;
if (!text) {
  throw new Error('Réponse Claude vide ou format inattendu. Contenu reçu: ' + JSON.stringify(response.content?.slice(0, 2)));
}

// 3. Nettoyer (backticks markdown, espaces)
const cleaned = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

// 4. Valider le JSON
let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (e) {
  // Donner du contexte sur l'erreur
  const errorPos = e.message.match(/position (\d+)/)?.[1];
  const context = errorPos ? cleaned.substring(Math.max(0, parseInt(errorPos) - 100), parseInt(errorPos) + 100) : cleaned.substring(0, 500);
  throw new Error(
    `JSON invalide: ${e.message}\n` +
    `Stop reason: ${stopReason}\n` +
    `Tokens utilisés: ${response.usage?.output_tokens || '?'}/${response.usage?.input_tokens || '?'}\n` +
    `Contexte autour de l'erreur:\n...${context}...`
  );
}

// 5. Validation structurelle minimale
const requiredKeys = ['intro', 'radar', 'deep_dive', 'signal', 'chiffre', 'reco', 'vrac'];
const missingKeys = requiredKeys.filter(k => !parsed[k]);
if (missingKeys.length > 0) {
  throw new Error(`JSON valide mais sections manquantes: ${missingKeys.join(', ')}. Claude n'a peut-être pas respecté la structure demandée.`);
}

if (!Array.isArray(parsed.radar) || parsed.radar.length < 2) {
  throw new Error(`Le radar doit contenir au moins 3 items, reçu: ${parsed.radar?.length || 0}`);
}

// 6. Formater la date
const today = new Date();
const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const moisNoms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateEdition = `${jours[today.getDay()]} ${today.getDate()} ${moisNoms[today.getMonth()]} ${today.getFullYear()}`;


return {
  newsletter: cleaned,
  date_edition: dateEdition,
  input_tokens: response.usage?.input_tokens || 0,  
  output_tokens: response.usage?.output_tokens || 0   
};
