import crypto from "crypto";

/**
 * Chiffrement AES-256-GCM des clés API de sources.
 * Le secret vient de SOURCE_KEY_ENCRYPTION_SECRET (openssl rand -hex 32).
 * Format stocké : iv.tag.ciphertext (hex).
 */
function getKey(): Buffer {
  const secret = process.env.SOURCE_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length !== 64) {
    throw new Error("SOURCE_KEY_ENCRYPTION_SECRET manquant ou invalide (attendu : 64 caractères hex)");
  }
  return Buffer.from(secret, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
