-- ============================================================================
-- 0000 : schéma complet, pour une installation neuve
-- ============================================================================
-- À exécuter en premier dans le SQL Editor d'un projet Supabase vierge.
-- Ce fichier décrit l'état FINAL du schéma : les migrations 0001 à 0005 sont
-- l'historique de la base d'origine et n'ont pas besoin d'être rejouées.
--
-- Principe de sécurité à garder en tête si vous modifiez ceci : le RLS filtre
-- les LIGNES, jamais les COLONNES. Toute colonne qu'un traitement serveur lit
-- comme une valeur de confiance (destinataire d'envoi, statut, clé chiffrée)
-- doit être retirée des privilèges d'écriture du rôle `authenticated`, sinon
-- elle est modifiable directement via PostgREST avec la clé anon publique.
-- ============================================================================

-- ── profils ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null unique,
  full_name         text,
  job_role          text,
  created_at        timestamptz not null default now(),
  -- BYOK : chaque utilisateur branche sa propre clé de fournisseur.
  llm_provider      text,
  llm_key_encrypted text,
  llm_key_hint      text,
  constraint profiles_llm_provider_check
    check (llm_provider is null or llm_provider in ('anthropic', 'openai'))
);

-- ── veilles ─────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  profile_prompt    text,
  frequency_cron    text not null default '0 7 * * 1-5',
  channel           text not null check (channel in ('slack', 'email')),
  destination       text,
  destination_label text,
  tone              text,
  language          text not null default 'fr',
  status            text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  -- Réglages de mise en page (template, accent, sections...) : voir
  -- `resolveDesign` côté code et 0007_design.sql pour l'historique de cette
  -- colonne. Serveur-only : ne JAMAIS l'ajouter au grant update ci-dessous.
  design            jsonb not null default '{"template":"editorial"}'::jsonb
    constraint subscriptions_design_is_object check (jsonb_typeof(design) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

-- ── sources ─────────────────────────────────────────────────────────────────
create table if not exists public.sources (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid not null references public.subscriptions(id) on delete cascade,
  url               text not null,
  feed_url          text,
  title             text,
  type              text not null default 'rss' check (type in ('rss', 'scrape', 'api')),
  api_key_encrypted text,
  added_by          text not null default 'user' check (added_by in ('user', 'lia')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'valid', 'invalid')),
  created_at        timestamptz not null default now()
);

create index if not exists sources_subscription_id_idx on public.sources (subscription_id);

-- ── éditions envoyées ───────────────────────────────────────────────────────
create table if not exists public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  sent_at         timestamptz not null default now(),
  status          text not null default 'success' check (status in ('success', 'error')),
  items           jsonb,
  error           text
);

create index if not exists deliveries_subscription_sent_idx
  on public.deliveries (subscription_id, sent_at desc);

-- ── mémoire anti-doublons ───────────────────────────────────────────────────
-- La contrainte d'unicité est COMPLÈTE (non partielle) : PostgREST en a besoin
-- pour l'upsert `on_conflict`.
create table if not exists public.delivered_items (
  id              bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  url_hash        text not null,
  url             text not null,
  url_norm        text,
  title           text,
  title_key       text,
  delivered_at    timestamptz not null default now(),
  unique (subscription_id, url_hash)
);

create index if not exists delivered_items_subscription_delivered_idx
  on public.delivered_items (subscription_id, delivered_at desc);

-- ── consommation de l'onboarding (clé de l'hébergeur) ───────────────────────
create table if not exists public.usage_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          text not null default 'chat' check (kind = 'chat'),
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric not null default 0 check (cost_usd >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists usage_log_user_created_idx on public.usage_log (user_id, created_at desc);

-- ============================================================================
-- Création automatique du profil à l'inscription
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Plafond d'inscriptions, utile pour une bêta fermée. Décommenter et ajuster.
-- create or replace function public.enforce_user_cap()
-- returns trigger language plpgsql security definer set search_path to 'public'
-- as $$
-- begin
--   if (select count(*) from auth.users) >= 30 then
--     raise exception 'capacity_reached: user limit (30) reached';
--   end if;
--   return new;
-- end;
-- $$;
-- create trigger before_user_cap before insert on auth.users
--   for each row execute function public.enforce_user_cap();

-- ============================================================================
-- RLS : chaque utilisateur ne voit que ses données
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.sources         enable row level security;
alter table public.deliveries      enable row level security;
alter table public.delivered_items enable row level security;
alter table public.usage_log       enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own subscriptions" on public.subscriptions;
create policy "own subscriptions" on public.subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own sources" on public.sources;
create policy "own sources" on public.sources
  for all to authenticated
  using (subscription_id in (select id from public.subscriptions where user_id = auth.uid()))
  with check (subscription_id in (select id from public.subscriptions where user_id = auth.uid()));

drop policy if exists "own deliveries" on public.deliveries;
create policy "own deliveries" on public.deliveries
  for select to authenticated
  using (subscription_id in (select id from public.subscriptions where user_id = auth.uid()));

drop policy if exists "own delivered items" on public.delivered_items;
create policy "own delivered items" on public.delivered_items
  for select to authenticated
  using (subscription_id in (select id from public.subscriptions where user_id = auth.uid()));

drop policy if exists "own usage" on public.usage_log;
create policy "own usage" on public.usage_log
  for select to authenticated using (user_id = auth.uid());

-- ============================================================================
-- Privilèges par colonne : la partie que le RLS ne sait pas faire
-- ============================================================================
-- Sans ces révocations, un utilisateur connecté peut modifier N'IMPORTE QUELLE
-- colonne de ses propres lignes via PostgREST, et contourner ainsi tous les
-- contrôles écrits dans les routes serveur. Concrètement : se réadresser les
-- digests vers un tiers, activer une veille sans passer par les quotas, ou
-- fausser le compteur de dépense.

revoke update, insert, delete on public.profiles from authenticated, anon;
grant  update (full_name, job_role) on public.profiles to authenticated;

-- La clé chiffrée ne doit jamais être servie au navigateur : seul l'indice l'est.
revoke select on public.profiles from authenticated, anon;
grant  select (id, email, full_name, job_role, created_at, llm_provider, llm_key_hint)
  on public.profiles to authenticated;

revoke update, insert on public.subscriptions from authenticated, anon;
grant  update (name, profile_prompt, tone, language) on public.subscriptions to authenticated;
-- DELETE reste autorisé : la suppression d'une veille passe par le client à
-- session, et le RLS y garantit déjà la propriété.

revoke insert, update, delete on public.usage_log from authenticated, anon;
