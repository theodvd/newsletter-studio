/**
 * Affichage humain d'un cron 5 champs (sous-ensemble utilisé par l'app :
 * minutes/heures fixes, jours de semaine en liste ou plage).
 * Retourne l'expression brute si elle sort de ce sous-ensemble.
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
      if (range) return `${DAY_NAMES[+range[1]] ?? d}–${DAY_NAMES[+range[2]] ?? d}`;
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
