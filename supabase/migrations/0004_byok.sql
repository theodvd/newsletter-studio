-- ============================================================================
-- 0004 : clé API par utilisateur (BYOK)
-- ============================================================================
-- Changement de modèle : plutôt qu'un plan payant que personne n'achètera,
-- chaque utilisateur branche sa propre clé (Anthropic, OpenAI ou tout endpoint
-- compatible OpenAI). Elle ne sert qu'à SES éditions. L'hébergeur ne paie plus
-- le coût récurrent, ce qui rend le projet tenable en open source et gratuit.
--
-- La conversation d'onboarding avec Lia reste, elle, à la charge de
-- l'hébergeur : c'est un coût unique et faible, et exiger une clé avant même
-- d'avoir vu le produit tuerait la découverte.
--
-- La clé est chiffrée en AES-256-GCM par `src/lib/crypto.ts`
-- (SOURCE_KEY_ENCRYPTION_SECRET), jamais stockée en clair.
-- ============================================================================

begin;

alter table public.profiles
  add column if not exists llm_provider text,
  add column if not exists llm_key_encrypted text,
  add column if not exists llm_key_hint text;

alter table public.profiles drop constraint if exists profiles_llm_provider_check;
alter table public.profiles add constraint profiles_llm_provider_check
  check (llm_provider is null or llm_provider in ('anthropic', 'openai'));

comment on column public.profiles.llm_key_encrypted is
  'Clé API du fournisseur, chiffrée AES-256-GCM (format iv.tag.ciphertext). Jamais exposée au client.';
comment on column public.profiles.llm_key_hint is
  'Quatre derniers caractères de la clé, pour que l''utilisateur reconnaisse laquelle est enregistrée.';

-- Ces colonnes ne sont écrites QUE par le serveur, via une route dédiée, et
-- ne doivent jamais être relues par le navigateur. La migration 0003 a déjà
-- restreint l'UPDATE de `profiles` à (full_name, job_role) : rien à ajouter
-- côté écriture. Côté lecture, la politique « own profile » autoriserait le
-- propriétaire à lire sa propre clé chiffrée : sans le secret de chiffrement
-- elle est inutilisable, mais on évite quand même de la diffuser.
revoke select on public.profiles from authenticated, anon;
grant select (id, email, full_name, job_role, created_at, plan, llm_provider, llm_key_hint)
  on public.profiles to authenticated;

commit;
