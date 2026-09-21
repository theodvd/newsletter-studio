/**
 * Garde anti-SSRF pour toutes les URLs fournies par l'utilisateur.
 *
 * Pourquoi : `validateSource` récupère n'importe quelle URL saisie dans le chat,
 * depuis un conteneur branché sur le réseau Docker partagé `openclaw_web` (n8n,
 * Langfuse et Caddy y sont joignables par leur nom). Sans garde, un utilisateur
 * peut faire sonder le réseau interne et l'endpoint de métadonnées du cloud,
 * puis récupérer le <title> des pages internes, qui est persisté en base et
 * renvoyé dans le flux SSE.
 *
 * Principe : on résout le nom DNS AVANT de se connecter et on refuse toute IP
 * non routable, puis on suit les redirections à la main pour revalider chaque
 * saut. Sans cette dernière étape, une URL publique qui redirige vers
 * 127.0.0.1 passerait la garde.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12000;

/** Vrai si l'IP appartient à une plage non routable sur l'internet public. */
function isPrivateIp(ip: string): boolean {
  const version = net.isIP(ip);

  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local, métadonnées cloud
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12, Docker
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast et réservé
    return false;
  }

  if (version === 6) {
    const n = ip.toLowerCase();
    if (n === "::1" || n === "::") return true; // loopback
    if (n.startsWith("fe80") || n.startsWith("fec0")) return true; // link-local
    if (/^f[cd]/.test(n)) return true; // ULA fc00::/7
    const mapped = n.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4 encapsulée
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }

  return true; // ni IPv4 ni IPv6 valide : on refuse par défaut
}

/**
 * Valide une URL destinée à un fetch côté serveur.
 * Lève une erreur si elle vise une cible interne.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL invalide");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Protocole non autorisé : ${url.protocol}`);
  }

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) {
    throw new Error(`Port non autorisé : ${port}`);
  }

  // Un nom sans point (« n8n », « localhost ») ne peut désigner qu'un hôte interne.
  if (!url.hostname.includes(".") || url.hostname === "localhost") {
    throw new Error("Hôte interne refusé");
  }

  // Hôte déjà littéral : on teste directement.
  if (net.isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) throw new Error("Adresse IP interne refusée");
    return url;
  }

  // Sinon on résout le DNS et on teste TOUTES les réponses : un nom peut
  // pointer vers plusieurs enregistrements A/AAAA, dont un interne.
  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new Error("Nom de domaine introuvable");
  }
  if (addresses.length === 0) throw new Error("Nom de domaine sans adresse");
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new Error("Le domaine pointe vers une adresse interne");
  }

  return url;
}

/**
 * Récupère le texte d'une URL en validant chaque saut de redirection.
 * Renvoie ok:false plutôt que de lever, pour rester compatible avec les
 * appelants existants qui traitent l'échec réseau comme un cas normal.
 */
export async function safeFetchText(
  raw: string
): Promise<{ ok: boolean; text: string; contentType: string }> {
  const failed = { ok: false, text: "", contentType: "" };
  let target = raw;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertPublicUrl(target);

      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LiaVeille/1.0)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual", // on gère les redirections nous-mêmes
      });

      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return failed;
        target = new URL(next, url).toString(); // revalidé au tour suivant
        continue;
      }

      return {
        ok: res.ok,
        text: await res.text(),
        contentType: res.headers.get("content-type") || "",
      };
    }
    return failed; // trop de redirections
  } catch {
    return failed;
  }
}
