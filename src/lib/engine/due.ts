/**
 * Détermine quelles veilles doivent partir maintenant.
 *
 * Remplace les « workflows fins » n8n (un déclencheur planifié par utilisateur).
 * Le principe est plus robuste qu'un simple « est-ce l'heure pile ? » : on
 * calcule la DERNIÈRE occurrence prévue avant l'instant courant, et la veille
 * est due si cette occurrence est récente et qu'aucune édition n'est partie
 * depuis. Conséquence utile : si le serveur était éteint à l'heure dite, le
 * digest part au redémarrage au lieu d'être perdu, et une double exécution du
 * tick ne provoque jamais deux envois.
 */

/** Fuseau d'évaluation des crons : ils sont écrits en heure locale. */
const TZ = process.env.ENGINE_TIMEZONE || "Europe/Paris";

/** Au-delà de ce retard, on considère l'occurrence périmée et on ne rattrape pas. */
export const CATCH_UP_MINUTES = 180;

/** Décalage du fuseau, en minutes, à un instant donné (gère l'heure d'été). */
function offsetMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let hour = get("hour");
  if (hour === 24) hour = 0; // certains environnements rendent minuit en « 24 »
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return (asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000;
}

/** Convertit une heure murale du fuseau en instant absolu. */
function zonedToInstant(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min, 0);
  const off = offsetMinutes(new Date(guess), tz);
  return new Date(guess - off * 60000);
}

/** Heure murale courante dans le fuseau. */
function nowParts(at: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Développe le champ « jour de semaine » d'un cron en liste de jours (0 = dimanche). */
function expandDow(dow: string): number[] {
  if (!dow || dow === "*") return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  for (const chunk of dow.split(",")) {
    const range = chunk.match(/^(\d)-(\d)$/);
    if (range) {
      for (let d = Number(range[1]); d <= Number(range[2]); d++) out.add(d % 7);
    } else if (/^\d$/.test(chunk)) {
      out.add(Number(chunk) % 7);
    }
  }
  return out.size ? Array.from(out) : [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Dernière occurrence prévue par le cron, à l'instant `at` ou avant.
 * Ne gère que le sous-ensemble accepté par `validateCron` (minute fixe,
 * heures fixes, jour et mois en « * », jours de semaine en liste ou plages).
 */
export function lastOccurrenceBefore(cron: string, at: Date, tz: string = TZ): Date | null {
  const parts = String(cron || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const minute = Number(parts[0]);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const hours = parts[1].split(",").map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  if (hours.length === 0) return null;
  const days = expandDow(parts[4]);

  const { year, month, day } = nowParts(at, tz);
  const sortedHours = [...hours].sort((a, b) => b - a); // décroissant

  // On remonte jour par jour, au plus une semaine en arrière.
  for (let back = 0; back <= 7; back++) {
    const dayStart = zonedToInstant(year, month, day, 12, 0, tz); // midi : évite les bords de DST
    const candidateDay = new Date(dayStart.getTime() - back * 86400000);
    const p = nowParts(candidateDay, tz);

    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
      .format(candidateDay);
    const dowIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    if (!days.includes(dowIndex)) continue;

    for (const h of sortedHours) {
      const occurrence = zonedToInstant(p.year, p.month, p.day, h, minute, tz);
      if (occurrence.getTime() <= at.getTime()) return occurrence;
    }
  }
  return null;
}

/**
 * Une veille est due si sa dernière occurrence prévue est récente (dans la
 * fenêtre de rattrapage) et qu'aucune édition n'est partie depuis.
 */
export function isDue(params: {
  cron: string;
  now: Date;
  lastSentAt: Date | null;
  catchUpMinutes?: number;
}): { due: boolean; occurrence: Date | null } {
  const occurrence = lastOccurrenceBefore(params.cron, params.now);
  if (!occurrence) return { due: false, occurrence: null };

  const ageMinutes = (params.now.getTime() - occurrence.getTime()) / 60000;
  if (ageMinutes > (params.catchUpMinutes ?? CATCH_UP_MINUTES)) {
    return { due: false, occurrence };
  }
  if (params.lastSentAt && params.lastSentAt.getTime() >= occurrence.getTime()) {
    return { due: false, occurrence };
  }
  return { due: true, occurrence };
}
