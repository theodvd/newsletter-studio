-- ============================================================================
-- 0009 : historique de conversation, opt-in
-- ============================================================================
-- Contexte
--   Jusqu'ici, l'app ne conservait volontairement AUCUNE conversation
--   d'onboarding (seules les conversations signalées comme anormales sont
--   gardées, voir 0006_flagged_conversations.sql). Cette migration donne à
--   chaque utilisateur le CHOIX de garder l'historique de ses échanges avec
--   Lia, pour reprendre une édition là où il l'avait laissée.
--
--   `profiles.keep_history` porte ce choix : `null` = jamais demandé (la
--   carte de consentement s'affiche), `false` = refusé, `true` = accepté.
--   La table `conversations` stocke, PAR VEILLE (une ligne par
--   `subscription_id`, unique), les messages déjà affichés à l'écran :
--   jamais les blocs internes (tool_use/tool_result), voir
--   `src/lib/agent/history.ts` (`filterVisibleMessages`) côté code.
--
-- Sécurité : les deux server-only, comme `design` et `previews`.
--   `keep_history` n'est PAS ajoutée au `grant update (...)` de 0003/0000 :
--   elle est écrite uniquement par `POST /api/settings/history`, avec la clé
--   service et un filtre de propriété explicite. Ne l'y ajoutez jamais.
--   `conversations` a le RLS activé SANS AUCUNE politique, et tous les
--   privilèges de table retirés à `anon`/`authenticated` : aucune ligne n'est
--   donc jamais visible ni écrivable via PostgREST, quelle que soit la clé
--   utilisée côté client. Les routes API lisent et écrivent avec la clé
--   service, après avoir vérifié la propriété (client à session sur
--   `subscriptions`, puis filtre explicite `user_id`/`subscription_id` sur
--   `conversations`), exactement comme `previews` (voir 0008).
--
-- Ordre de déploiement : SQL d'abord (cette migration), CODE ensuite. Le code
--   de cette étape sélectionne `profiles.keep_history` et lit/écrit
--   `conversations` : sans cette migration appliquée, ces requêtes échouent.
--   Appliquer cette migration seule, avant le code, ne casse rien : une
--   colonne et une table de plus, ignorées par le code déployé aujourd'hui.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- profils : le choix de conservation
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists keep_history boolean;

-- ---------------------------------------------------------------------------
-- conversations : l'historique visible, une ligne par veille
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- Messages user/assistant en texte uniquement (voir `filterVisibleMessages`
  -- côté code) : jamais un tool_use/tool_result, jamais un payload interne.
  messages        jsonb not null,
  updated_at      timestamptz not null default now(),
  unique (subscription_id)
);

create index if not exists conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

-- Aucune politique : table strictement serveur-only, voir le bloc Sécurité
-- ci-dessus. Les GRANT par défaut de Supabase donnent malgré tout des
-- privilèges de table à `anon`/`authenticated` : on les retire explicitement,
-- comme il faut le faire à chaque nouvelle table de ce projet.
revoke all on public.conversations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- correction de données : entités HTML échappées dans les noms de veille
-- ---------------------------------------------------------------------------
-- Le modèle a parfois écrit l'entité littérale au lieu du caractère (ex.
-- « React Native &amp; AI Dev Weekly » au lieu de « React Native & AI Dev
-- Weekly »), constaté en production sur une veille active. Voir le correctif
-- apporté à `saveConfig`/`set_design` côté code (décodage avant stockage,
-- `src/lib/text/decode-entities.ts`) : ce fix ponctuel corrige les lignes
-- déjà en base. Idempotent : une deuxième exécution ne trouve plus rien à
-- remplacer, chaque `update` étant borné par un `where ... like` sur
-- l'entité qu'il retire.
update public.subscriptions set name = replace(name, '&amp;', '&')  where name like '%&amp;%';
update public.subscriptions set name = replace(name, '&lt;', '<')   where name like '%&lt;%';
update public.subscriptions set name = replace(name, '&gt;', '>')   where name like '%&gt;%';
update public.subscriptions set name = replace(name, '&quot;', '"') where name like '%&quot;%';
update public.subscriptions set name = replace(name, '&#39;', '''') where name like '%&#39;%';

commit;
