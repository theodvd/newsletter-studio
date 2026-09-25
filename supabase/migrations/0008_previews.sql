-- ============================================================================
-- 0008 : aperçu d'une veille avant lancement (étape 2 « preview »)
-- ============================================================================
-- Contexte
--   Avant cette migration, la seule façon de voir le rendu d'une veille était
--   de la lancer pour de vrai. Cette table stocke l'ÉDITION générée (le JSON
--   produit par le modèle, pas seulement son HTML) : un changement de design
--   ultérieur (couleur, sections, template à l'étape 3) peut donc la
--   re-rendre gratuitement, sans rappeler le modèle.
--
--   `usage_log.kind` n'acceptait que 'chat' (la conversation d'onboarding).
--   Une génération d'aperçu réelle tourne aussi sur la clé de l'hébergeur
--   (voir `checkSpendAllowed`) et doit donc compter dans le même plafond
--   hebdomadaire : le check est élargi à 'chat' et 'preview'.
--
-- Ordre de déploiement (IMPORTANT)
--   0007 (colonne `design`) et 0008 (cette migration) peuvent TOUTES LES DEUX
--   être appliquées AVANT le code de cette étape : 0007 ajoute une colonne
--   avec un défaut que l'ancien code ignore, 0008 ajoute une table et élargit
--   un check, aucune des deux ne casse le code déployé aujourd'hui.
--   EN REVANCHE, le code de cette étape (routes `/api/preview*`) sélectionne
--   explicitement la colonne `design` : il exige donc que 0007 ET 0008 soient
--   déjà appliquées. Ordre à suivre : SQL d'abord (0007 puis 0008), CODE
--   ensuite. Voir la note mise à jour en tête de 0007_design.sql.
--
-- Sécurité : table serveur-only, comme `usage_log`.
--   RLS activé SANS AUCUNE politique : aucune ligne n'est donc jamais
--   visible ni écrivable via PostgREST, quelle que soit la clé utilisée côté
--   client (anon ou authenticated). Les routes API lisent et écrivent avec la
--   clé service, après avoir vérifié la propriété de la veille avec le
--   client à session (RLS), et filtrent chaque requête sur `previews` par
--   `subscription_id` ET `user_id` : la clé service ignore le RLS, la
--   propriété doit donc être vérifiée explicitement à chaque requête, comme
--   partout ailleurs dans ce projet (voir 0003).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- usage_log : élargir le check à 'chat' et 'preview'
-- ---------------------------------------------------------------------------
-- Nom retrouvé dans 0000_schema.sql : c'est un check inline sur la colonne
-- `kind`, donc généré automatiquement par Postgres sous la forme
-- `<table>_<colonne>_check`.
alter table public.usage_log drop constraint if exists usage_log_kind_check;
alter table public.usage_log add constraint usage_log_kind_check
  check (kind in ('chat', 'preview'));

-- ---------------------------------------------------------------------------
-- previews : l'édition générée, pour un rendu et un renvoi gratuits ensuite
-- ---------------------------------------------------------------------------
create table if not exists public.previews (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- L'édition complète (JSON produit par le modèle) : re-rendable avec
  -- n'importe quel design ultérieur, sans rappeler le modèle.
  edition         jsonb not null,
  input_tokens    int not null default 0,
  output_tokens   int not null default 0,
  cost_usd        numeric not null default 0 check (cost_usd >= 0),
  -- Nombre d'envois de test déjà effectués depuis cette édition, et bornés
  -- par `previewSendsPerPreview` (voir src/lib/plan.ts).
  sent_count      int not null default 0,
  last_sent_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists previews_subscription_created_idx
  on public.previews (subscription_id, created_at desc);
create index if not exists previews_user_created_idx
  on public.previews (user_id, created_at desc);

alter table public.previews enable row level security;

-- Aucune politique : table strictement serveur-only, voir le bloc Sécurité
-- ci-dessus. Les GRANT par défaut de Supabase donnent malgré tout des
-- privilèges de table à `anon`/`authenticated` : on les retire explicitement,
-- comme il faut le faire à chaque nouvelle table de ce projet.
revoke all on public.previews from anon, authenticated;

commit;
