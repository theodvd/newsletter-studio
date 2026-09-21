/**
 * Affichage humain d'un cron 5 champs (sous-ensemble utilisé par l'app :
 * minutes/heures fixes, jours de semaine en liste ou plage).
 * Retourne l'expression brute si elle sort de ce sous-ensemble.
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Plafond global de cadence, toutes formules confondues.
 * Ce n'est pas un quota commercial : c'est une limite de sécurité. Une veille
 * est un digest, pas un flux temps réel, et rien ne justifie de marteler le
 * serveur et les sites sources plus de deux fois par jour.
 */
export const MAX_RUNS_PER_WEEK = 14;

export type CronCheck =
  | { ok: true; runsPerWeek: number }
  | { ok: false; reason: string };

/**
 * Valide une expression cron par liste blanche stricte, et calcule le nombre
 * d'exécutions par semaine.
 *
 * Le sous-ensemble autorisé est exactement celui que l'app sait produire :
 *   minute  : un entier fixe (0-59)
 *   heure   : un entier fixe, ou une liste d'entiers séparés par des virgules
 *   jour    : « * » uniquement
 *   mois    : « * » uniquement
 *   semaine : « * », ou une liste de jours (0-6) et/ou de plages (« 1-5 »)
 *
 * Tout le reste est refusé, ce qui élimine par construction les formes
 * dangereuses : « * * * * * » (chaque minute), les pas « / », les listes de
 * minutes. À appeler AVANT toute écriture vers n8n.
 */
export function validateCron(raw: string): CronCheck {
  const parts = String(raw || "").trim().split(/\s+/);
  if (parts.length !== 5) {
    return { ok: false, reason: "The schedule must have exactly 5 fields (minute hour day month weekday)." };
  }

  const [min, hour, dom, month, dow] = parts;

  if (!/^\d{1,2}$/.test(min) || Number(min) > 59) {
    return { ok: false, reason: "The minute must be a fixed number between 0 and 59." };
  }

  if (!/^\d{1,2}(,\d{1,2})*$/.test(hour)) {
    return { ok: false, reason: "The hour must be a fixed number, or a comma-separated list of hours." };
  }
  const hours = hour.split(",").map(Number);
  if (hours.some((h) => h > 23)) {
    return { ok: false, reason: "Hours must be between 0 and 23." };
  }
  if (new Set(hours).size !== hours.length) {
    return { ok: false, reason: "The same hour is listed twice." };
  }

  if (dom !== "*" || month !== "*") {
    return { ok: false, reason: "Day of month and month must both be \"*\"." };
  }

  let days: number[];
  if (dow === "*") {
    days = [0, 1, 2, 3, 4, 5, 6];
  } else {
    if (!/^[0-6](-[0-6])?(,[0-6](-[0-6])?)*$/.test(dow)) {
      return { ok: false, reason: "Weekdays must be numbers from 0 to 6, as a list and/or ranges (e.g. \"1-5\")." };
    }
    const set = new Set<number>();
    for (const chunk of dow.split(",")) {
      const range = chunk.match(/^(\d)-(\d)$/);
      if (range) {
        const [from, to] = [Number(range[1]), Number(range[2])];
        if (from > to) return { ok: false, reason: `Invalid weekday range: "${chunk}".` };
        for (let d = from; d <= to; d++) set.add(d);
      } else {
        set.add(Number(chunk));
      }
    }
    days = Array.from(set);
  }

  const runsPerWeek = hours.length * days.length;
  if (runsPerWeek > MAX_RUNS_PER_WEEK) {
    return {
      ok: false,
      reason: `That schedule would send ${runsPerWeek} editions per week. The maximum is ${MAX_RUNS_PER_WEEK} (twice a day).`,
    };
  }

  return { ok: true, runsPerWeek };
}

export function describeCron(cron: string): string {
  const parts = String(cron || "").trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;

  if (!/^\d+$/.test(min) || !/^\d+(,\d+)*$/.test(hour) || dom !== "*") return cron;

  const times = hour
    .split(",")
    .map((h) => `${h.padStart(2, "0")}:${min.padStart(2, "0")}`)
    .join(" & ");

  let days = "every day";
  if (dow !== "*") {
    const rendered = dow.split(",").map((d) => {
      const range = d.match(/^(\d)-(\d)$/);
      if (range) return `${DAY_NAMES[+range[1]] ?? d}-${DAY_NAMES[+range[2]] ?? d}`;
      return DAY_NAMES[+d] ?? d;
    });
    if (rendered.some((r) => r.includes("undefined"))) return cron;
    days = rendered.join(", ");
  }

  const perDay = hour.split(",").length;
  const singleDay = dow !== "*" && !dow.includes("-") && dow.split(",").length === 1;
  const freq = perDay > 1 ? "Twice a day" : singleDay ? "Weekly" : "Daily";

  return `${freq} at ${times}, ${days}`;
}
