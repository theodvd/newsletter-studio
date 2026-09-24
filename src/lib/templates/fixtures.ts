/**
 * Éditions d'exemple : aperçu visuel (`scripts/preview-email.ts`) et tests.
 * Contenu inventé mais plausible (thématique fintech/IA), URLs sur
 * `example.com`, jamais d'appel réseau ni de donnée réelle.
 */

import type { Language } from "./i18n";
import type { DeepDive, Edition, EditionItem, NumberHighlight, Pick as PickItem, SectionId } from "./types";

type EditorialPool = {
  subject: string;
  preheader: string;
  intro: string;
  radar: EditionItem[];
  deep_dive: DeepDive;
  signal: EditionItem[];
  number: NumberHighlight;
  pick: PickItem;
  outro: string;
};

function poolFr(): EditorialPool {
  return {
    subject: "Stripe muscle son offre de trésorerie pour les PME",
    preheader: "Aussi cette semaine : la BCE temporise, et Klarna prépare son introduction en bourse.",
    intro:
      "Cette semaine, l'infrastructure de paiement continue de grignoter le terrain des banques traditionnelles, pendant que les régulateurs avancent à pas comptés. Pour un profil comme le tien, ça change surtout la vitesse à laquelle tes concurrents peuvent lancer de nouveaux produits financiers. Voici les trois signaux à capter cette semaine.",
    radar: [
      {
        tag: "fintech",
        title: "Stripe lance un compte de trésorerie rémunéré pour les PME européennes",
        summary:
          "Le produit combine un compte multi-devises et un rendement quotidien sur les soldes non utilisés. Il cible en priorité les entreprises qui facturent déjà via Stripe.",
        takeaway:
          "Si ta stack de paiement repose sur Stripe, ce produit peut remplacer une partie de ta trésorerie bancaire classique sans intégration supplémentaire.",
        url: "https://example.com/stripe-tresorerie-pme",
        source: "The Fintech Times",
        image_url: null,
      },
      {
        tag: "regulation",
        title: "La BCE maintient ses taux directeurs, deuxième trimestre de suite",
        summary:
          "Le conseil des gouverneurs évoque une inflation encore trop instable pour desserrer sa politique monétaire, malgré la pression de plusieurs gouvernements de la zone euro.",
        takeaway:
          "Les conditions de financement restent tendues au moins jusqu'au prochain comité : à intégrer si un tour de table est prévu ce semestre.",
        url: "https://example.com/bce-taux-inchanges",
        source: "Les Echos",
        image_url: null,
      },
      {
        tag: "ia",
        title: "Klarna vise 90 % de support client automatisé d'ici la fin de l'année",
        summary:
          "L'entreprise suédoise détaille les gains obtenus depuis le déploiement de son agent conversationnel, tout en admettant avoir dû réembaucher une partie des équipes supprimées trop vite.",
        takeaway:
          "Un rappel utile avant de réduire une équipe support sur la promesse d'un agent IA : mesurer d'abord la qualité perçue, pas seulement le coût.",
        url: "https://example.com/klarna-support-ia",
        source: "Reuters",
        image_url: null,
      },
    ],
    deep_dive: {
      tag: "fintech",
      title: "Klarna vise enfin son introduction en bourse : ce que révèle son prospectus",
      url: "https://example.com/klarna-ipo-prospectus",
      source: "Financial Times",
      image_url: null,
      parts: [
        {
          heading: "Le calendrier",
          body: "Klarna a déposé une nouvelle version de son prospectus, avec une cotation visée avant la fin de l'année. L'entreprise avait déjà tenté sa chance en 2025, avant de reporter face à la volatilité des marchés.",
        },
        {
          heading: "Ce que montrent les chiffres",
          body: "Le volume de paiements traité progresse de 22 % sur un an, porté par l'Amérique du Nord. La rentabilité, elle, reste fragile : les provisions pour impayés augmentent plus vite que les revenus.",
        },
        {
          heading: "Pourquoi maintenant",
          body: "La fenêtre de marché pour les introductions en bourse fintech s'est rouverte ces derniers mois, avec plusieurs opérations bien accueillies. Klarna cherche à en profiter avant qu'elle ne se referme.",
        },
      ],
      in_short:
        "Klarna avance vers une cotation avant la fin de l'année, avec une croissance solide mais une rentabilité qui reste à démontrer aux investisseurs publics.",
    },
    signal: [
      {
        tag: "crypto",
        title: "Une banque régionale allemande teste le règlement en stablecoin pour ses clients entreprises",
        summary: "Le programme pilote reste limité à une dizaine de clients, mais marque une première pour une banque traditionnelle du pays.",
        url: "https://example.com/banque-allemande-stablecoin",
        source: "Handelsblatt",
        image_url: null,
      },
      {
        tag: "tech",
        title: "Un fonds souverain du Golfe augmente sa participation dans deux scale-ups fintech européennes",
        summary: "L'opération reste discrète, sans communiqué officiel des deux parties.",
        url: "https://example.com/fonds-golfe-participation",
        source: "Bloomberg",
        image_url: null,
      },
      {
        tag: "regulation",
        title: "Le régulateur britannique consulte sur l'usage de l'IA dans le scoring de crédit",
        summary: "Les réponses sont attendues avant la fin du trimestre.",
        url: "https://example.com/fca-consultation-ia-scoring",
        source: "FCA",
        image_url: null,
      },
    ],
    number: {
      value: "22 %",
      label: "croissance du volume de paiements Klarna sur un an",
      context: "Une progression tirée par l'Amérique du Nord, où l'entreprise cherche à compenser un marché européen plus mature.",
      url: "https://example.com/klarna-ipo-prospectus",
      source: "Financial Times",
    },
    pick: {
      title: "Payments 2026 : le rapport annuel sur les infrastructures de paiement",
      kind: "rapport",
      why: "Une synthèse dense mais claire sur l'état des rails de paiement dans le monde, utile pour situer où se joue la bataille de l'infrastructure.",
      url: "https://example.com/rapport-paiements-2026",
      source: "Banque des règlements internationaux",
    },
    outro: "Bonne semaine, et à bientôt pour la prochaine édition.",
  };
}

function poolEn(): EditorialPool {
  return {
    subject: "Stripe muscles up treasury for small businesses",
    preheader: "Also this week: the Fed holds steady, and Klarna files for its IPO.",
    intro:
      "This week, payment infrastructure keeps eating into traditional banks' territory, while regulators move at a cautious pace. For a profile like yours, this mostly changes how fast your competitors can ship new financial products. Here are the three signals worth catching this week.",
    radar: [
      {
        tag: "fintech",
        title: "Stripe launches an interest-bearing treasury account for small businesses",
        summary:
          "The product combines a multi-currency account with daily yield on idle balances. It primarily targets businesses that already invoice through Stripe.",
        takeaway:
          "If your payment stack already runs on Stripe, this product could replace part of your traditional banking treasury without extra integration work.",
        url: "https://example.com/stripe-treasury-smb",
        source: "The Fintech Times",
        image_url: null,
      },
      {
        tag: "regulation",
        title: "The Fed holds rates steady for a second straight quarter",
        summary:
          "The committee cited inflation still too unstable to ease policy, despite pressure from several member economies.",
        takeaway:
          "Financing conditions stay tight at least until the next meeting: worth factoring in if a raise is planned this half.",
        url: "https://example.com/fed-holds-rates",
        source: "Reuters",
        image_url: null,
      },
      {
        tag: "ai",
        title: "Klarna targets 90% automated customer support by year end",
        summary:
          "The Swedish company detailed gains from its conversational agent rollout, while admitting it had to rehire part of the team it cut too fast.",
        takeaway:
          "A useful reminder before cutting a support team on the promise of an AI agent: measure perceived quality first, not just cost.",
        url: "https://example.com/klarna-ai-support",
        source: "Reuters",
        image_url: null,
      },
    ],
    deep_dive: {
      tag: "fintech",
      title: "Klarna's IPO filing: what the prospectus actually shows",
      url: "https://example.com/klarna-ipo-prospectus-en",
      source: "Financial Times",
      image_url: null,
      parts: [
        {
          heading: "The timeline",
          body: "Klarna filed an updated prospectus, targeting a listing before year end. The company already tried once in 2025, before pulling back amid market volatility.",
        },
        {
          heading: "What the numbers show",
          body: "Payment volume grew 22% year over year, led by North America. Profitability stays fragile though: bad debt provisions are growing faster than revenue.",
        },
        {
          heading: "Why now",
          body: "The market window for fintech IPOs has reopened in recent months, with several well-received listings. Klarna is trying to catch that window before it closes.",
        },
      ],
      in_short:
        "Klarna is moving toward a listing before year end, with solid growth but profitability it still has to prove to public market investors.",
    },
    signal: [
      {
        tag: "crypto",
        title: "A German regional bank pilots stablecoin settlement for corporate clients",
        summary: "The pilot stays limited to a handful of clients, but marks a first for a traditional bank in the country.",
        url: "https://example.com/german-bank-stablecoin",
        source: "Handelsblatt",
        image_url: null,
      },
      {
        tag: "tech",
        title: "A Gulf sovereign fund increases its stake in two European fintech scale-ups",
        summary: "The deal stays quiet, with no official statement from either side.",
        url: "https://example.com/gulf-fund-stake",
        source: "Bloomberg",
        image_url: null,
      },
      {
        tag: "regulation",
        title: "UK regulator opens consultation on AI use in credit scoring",
        summary: "Responses are due before the end of the quarter.",
        url: "https://example.com/fca-ai-scoring-consultation",
        source: "FCA",
        image_url: null,
      },
    ],
    number: {
      value: "22%",
      label: "growth in Klarna's payment volume year over year",
      context: "A gain led by North America, where the company is trying to offset a more mature European market.",
      url: "https://example.com/klarna-ipo-prospectus-en",
      source: "Financial Times",
    },
    pick: {
      title: "Payments 2026: the annual report on global payment infrastructure",
      kind: "report",
      why: "A dense but clear overview of where payment rails stand worldwide, useful to place where the infrastructure battle really happens.",
      url: "https://example.com/payments-report-2026",
      source: "Bank for International Settlements",
    },
    outro: "Have a good week, see you in the next edition.",
  };
}

/** Édition d'exemple, générique et plausible, pour l'aperçu et les tests. */
export function sampleEdition(language: Language, sections: SectionId[]): Edition {
  const pool = language === "fr" ? poolFr() : poolEn();
  const has = (id: SectionId) => sections.includes(id);

  const edition: Edition = {
    subject: pool.subject,
    preheader: pool.preheader,
    intro: pool.intro,
    outro: pool.outro,
  };
  if (has("radar")) edition.radar = pool.radar;
  if (has("deep_dive")) edition.deep_dive = pool.deep_dive;
  if (has("signal")) edition.signal = pool.signal;
  if (has("number")) edition.number = pool.number;
  if (has("pick")) edition.pick = pool.pick;
  return edition;
}

// ─────────────────────────────────────────────────────────────────────────
// Fixture du test de non-régression du template classic.
//
// NE PAS MODIFIER son contenu : elle doit rester synchronisée avec le golden
// capturé AVANT le refactor, dans `__fixtures__/classic.golden.json` (sortie
// de `renderEmailHtml`/`renderSlackBlocks` d'origine sur ces mêmes données).
// ─────────────────────────────────────────────────────────────────────────

export const classicFixtureEdition: Edition = {
  subject: "OpenAI lève 6,6 milliards, la Fed hésite sur les taux",
  intro: "Une semaine chargée entre levées record et prudence monétaire : voici ce qu'il faut retenir.",
  items: [
    {
      tag: "ia",
      title: "OpenAI boucle un tour de table de 6,6 milliards de dollars",
      summary:
        "La valorisation grimpe à 157 milliards de dollars. Thrive Capital mène le tour, avec Microsoft en participation notable.",
      takeaway:
        "Pour un professionnel de la fintech, ce niveau de valorisation redéfinit les attentes de rentabilité des futurs tours IA.",
      url: "https://example.com/openai-levee-6-6-milliards",
      source: "TechCrunch",
    },
    {
      tag: "regulation",
      title: "La Fed maintient ses taux, prudence assumée",
      summary: "Le comité de politique monétaire évoque une inflation encore trop instable pour baisser les taux dès ce trimestre.",
      takeaway: "Les conditions de financement des startups fintech restent tendues au moins jusqu'au prochain comité.",
      url: "https://example.com/fed-taux-inchanges",
      source: "Reuters",
    },
    {
      tag: "fintech",
      title: "Stripe étend son offre de trésorerie aux PME européennes",
      summary: "",
      takeaway: "",
      url: "https://example.com/stripe-tresorerie-pme",
      source: "",
    },
  ],
  outro: "Bonne semaine, et à lundi prochain.",
};

export const classicFixtureContext = {
  subscriptionName: "Veille Fintech",
  dateLabel: "Lundi 21 septembre 2026",
  language: "fr",
};
