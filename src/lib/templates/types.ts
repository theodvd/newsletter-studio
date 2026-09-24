/**
 * Contrat des templates d'édition.
 *
 * Un template sépare le fond et la forme. Il dit au modèle QUELLES sections
 * remplir (la spec injectée dans le prompt), valide sa réponse, puis la met en
 * page. Le modèle ne produit jamais de HTML : le design ne peut donc ni casser
 * l'email ni servir de vecteur d'injection, et changer de template ne demande
 * aucune modification du moteur.
 */

export type TemplateId = "classic" | "editorial";

/** Sections du template editorial, dans leur ordre par défaut. */
export type SectionId = "radar" | "deep_dive" | "signal" | "number" | "pick";

/** Réglages de mise en page d'une veille (colonne `subscriptions.design`). */
export type Design = {
  template: TemplateId;
  /** Couleur d'accent, au format #RRGGBB. */
  accent: string;
  /** Titre de l'en-tête. `null` : le nom de la veille. */
  title: string | null;
  /** Sections actives et leur ordre (template editorial uniquement). */
  sections: SectionId[];
  /** Afficher les images d'articles. */
  images: boolean;
};

/** Un article cité dans l'édition. */
export type EditionItem = {
  tag?: string;
  title: string;
  summary?: string;
  /**
   * Ce que l'article change pour CE lecteur. Classic : le « why it matters ».
   * Editorial : l'encadré sous chaque sujet du Radar.
   */
  takeaway?: string;
  url: string;
  source?: string;
  /** Rempli par le moteur après la génération, jamais par le modèle. */
  image_url?: string | null;
};

/** Le sujet approfondi du template editorial. */
export type DeepDive = EditionItem & {
  parts: Array<{ heading: string; body: string }>;
  /** Le résumé final, mis en valeur dans un encadré de couleur. */
  in_short: string;
};

/** « Le Chiffre » : un nombre tiré d'un article, jamais inventé. */
export type NumberHighlight = {
  value: string;
  label: string;
  context: string;
  url?: string;
  source?: string;
};

/** « La Reco » : une lecture, un rapport ou un outil à ne pas manquer. */
export type Pick = {
  title: string;
  kind: string;
  why: string;
  url: string;
  source?: string;
};

/** L'édition produite par le modèle, commune à tous les templates. */
export type Edition = {
  subject: string;
  preheader?: string;
  intro: string;
  /** Template classic : la liste d'articles. */
  items?: EditionItem[];
  /** Template editorial : une clé par section active. */
  radar?: EditionItem[];
  deep_dive?: DeepDive;
  signal?: EditionItem[];
  number?: NumberHighlight;
  pick?: Pick;
  outro?: string;
};

/** Ce qu'un template doit savoir pour écrire sa spec et valider la réponse. */
export type SpecContext = {
  design: Design;
  channel: "email" | "slack";
  /** Code de langue de rédaction (`fr`, `en`...). */
  language: string;
};

/** Ce qu'un template reçoit pour mettre une édition en page. */
export type RenderContext = {
  edition: Edition;
  design: Design;
  /** Nom de la veille, utilisé quand `design.title` est vide. */
  subscriptionName: string;
  /** Date de l'édition, déjà formatée dans la langue de la veille. */
  dateLabel: string;
  language: string;
};

export type SlackPayload = { text: string; blocks: unknown[] };

export interface Template {
  id: TemplateId;
  /** Bloc « format de sortie et règles » injecté dans le prompt système. */
  outputSpec(ctx: SpecContext): string;
  /** Plafond de tokens de sortie, adapté à la longueur attendue. */
  maxOutputTokens(ctx: SpecContext): number;
  /** Valide la réponse déjà parsée en JSON. Lève une erreur explicite sinon. */
  validate(parsed: unknown, ctx: SpecContext): Edition;
  renderEmail(ctx: RenderContext): string;
  renderSlack(ctx: RenderContext): SlackPayload;
}
