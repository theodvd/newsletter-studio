-- ============================================================================
-- 0006 : conversations signalées
-- ============================================================================
-- L'application ne conserve AUCUNE conversation d'onboarding : le client
-- renvoie l'historique à chaque tour, rien n'est persisté. Cette table est la
-- seule exception, et elle est délibérément étroite : on n'y écrit une
-- conversation que lorsqu'elle déclenche un signal d'abus (tentative de
-- détournement de l'agent, recherche de secrets, sondage du réseau interne).
--
-- C'est un choix de conception, pas une limitation technique : tout enregistrer
-- « au cas où » transformerait un outil de veille en outil de surveillance.
--
-- Conséquence à assumer si vous exploitez cette application : vous conservez
-- alors des messages d'utilisateurs. Dites-le dans votre politique de
-- confidentialité, et gardez la purge automatique active (voir le moteur).
-- ============================================================================

begin;

create table if not exists public.flagged_conversations (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  email       text,
  score       integer not null default 0,
  summary     text not null,
  signals     jsonb not null default '[]'::jsonb,
  messages    jsonb not null default '[]'::jsonb,
  reviewed    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists flagged_conversations_created_idx
  on public.flagged_conversations (created_at desc);
create index if not exists flagged_conversations_user_idx
  on public.flagged_conversations (user_id, created_at desc);

-- Table strictement serveur : ni lecture ni écriture par le client. La console
-- d'administration passe par la clé service après vérification de l'identité.
alter table public.flagged_conversations enable row level security;
revoke all on public.flagged_conversations from authenticated, anon;

commit;
