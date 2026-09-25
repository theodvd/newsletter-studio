import { notFound } from "next/navigation";
import { editorialTemplate } from "@/lib/templates/editorial";
import { sampleEdition } from "@/lib/templates/fixtures";
import { formatEditionDate } from "@/lib/templates/i18n";
import type { Design, RenderContext } from "@/lib/templates/types";
import { DevPreviewHarness } from "./harness";

/**
 * Harnais de QA visuelle pour `PreviewDialog`, HORS PRODUCTION uniquement :
 * rend la modale ouverte avec du HTML d'exemple, construit ici côté serveur
 * (`sampleEdition` + `editorialTemplate.renderEmail`), sans toucher
 * Supabase, ni appeler un modèle, ni envoyer d'email. Le middleware ne rend
 * `/dev` public que quand `NODE_ENV !== "production"` (voir middleware.ts) :
 * ce `notFound()` est la deuxième barrière, au cas où la page serait quand
 * même atteinte.
 */
export default function DevPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const subscriptionName = "Fintech Weekly (fixture)";
  const design: Design = {
    template: "editorial",
    accent: "#7cc6ff",
    title: null,
    sections: ["radar", "deep_dive", "signal", "number", "pick"],
    images: true,
  };
  const edition = sampleEdition("en", design.sections);
  const renderCtx: RenderContext = {
    edition,
    design,
    subscriptionName,
    dateLabel: formatEditionDate(new Date(), "en"),
    language: "en",
  };
  const html = editorialTemplate.renderEmail(renderCtx);

  return (
    <DevPreviewHarness
      subscriptionName={subscriptionName}
      initialPayload={{
        source: "sample",
        subject: edition.subject,
        html,
        generationsLeftToday: 1,
        canSend: false,
      }}
    />
  );
}
