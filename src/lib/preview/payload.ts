/**
 * Construit la réponse de `GET /api/preview` (et le corps que `POST
 * /api/preview` renvoie juste après avoir généré et stocké une édition).
 *
 * Fonction pure : aucun accès réseau ni base de données. La route API va
 * chercher l'édition stockée la plus récente (s'il y en a une) et les
 * compteurs des dernières 24h, puis les passe ici. Séparée de la route pour
 * être testée sans Supabase.
 */

import { getTemplate } from "@/lib/templates";
import { resolveDesignForSubscription } from "@/lib/templates/design";
import { classicFixtureEdition, sampleEdition } from "@/lib/templates/fixtures";
import { formatEditionDate, normalizeLanguage } from "@/lib/templates/i18n";
import type { Edition, RenderContext } from "@/lib/templates/types";
import { generationsLeftToday, type GenerationCounts, type PreviewGenerationLimits } from "./limits";

export type StoredPreview = {
  edition: Edition;
  created_at: string;
  sent_count: number;
};

export type PreviewSubscription = {
  name: string;
  language: string | null;
  frequency_cron: string;
  status: string;
  design?: unknown;
};

export type BuildPreviewPayloadInput = {
  sub: PreviewSubscription;
  /** L'édition stockée la plus récente pour cette veille, ou `null` s'il n'y en a jamais eu. */
  storedPreview: StoredPreview | null;
  now: Date;
  counts: GenerationCounts;
  limits: PreviewGenerationLimits & { previewSendsPerPreview: number };
};

export type PreviewPayload = {
  source: "generated" | "sample";
  subject: string;
  html: string;
  /** Présent seulement quand `source` vaut `"generated"`. */
  createdAt?: string;
  generationsLeftToday: number;
  canSend: boolean;
};

export function buildPreviewPayload(input: BuildPreviewPayloadInput): PreviewPayload {
  const { sub, storedPreview, now, counts, limits } = input;

  const design = resolveDesignForSubscription(sub);
  const template = getTemplate(design.template);
  const language = sub.language || "fr";
  const dateLabel = formatEditionDate(now, language);
  const left = generationsLeftToday(counts, limits);

  if (storedPreview) {
    const renderCtx: RenderContext = {
      edition: storedPreview.edition,
      design,
      subscriptionName: sub.name,
      dateLabel,
      language,
    };
    return {
      source: "generated",
      subject: storedPreview.edition.subject,
      html: template.renderEmail(renderCtx),
      createdAt: storedPreview.created_at,
      generationsLeftToday: left,
      canSend: storedPreview.sent_count < limits.previewSendsPerPreview,
    };
  }

  // Jamais générée pour de vrai : aperçu d'exemple, instantané et gratuit.
  // Le template classic n'a pas de notion de « sections » (contrairement à
  // editorial) : on lui donne sa propre fixture (`items`), pas `sampleEdition`.
  const edition: Edition =
    design.template === "classic" ? classicFixtureEdition : sampleEdition(normalizeLanguage(language), design.sections);
  const renderCtx: RenderContext = {
    edition,
    design,
    subscriptionName: sub.name,
    dateLabel,
    language,
  };
  return {
    source: "sample",
    subject: edition.subject,
    html: template.renderEmail(renderCtx),
    generationsLeftToday: left,
    canSend: false,
  };
}
