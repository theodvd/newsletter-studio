-- ============================================================================
-- 0003 : verrouiller les colonnes que le serveur considère comme sûres
-- ============================================================================
-- Problème corrigé
--   RLS contrôle QUELLES LIGNES un utilisateur peut écrire, jamais QUELLES
--   COLONNES. Les politiques « FOR ALL ... user_id = auth.uid() » laissaient
--   donc un utilisateur connecté modifier n'importe quelle colonne de ses
--   propres lignes, directement via PostgREST : l'URL du projet et la clé anon
--   sont publiques par conception, et son JWT est dans ses cookies.
--
--   Trois contrôles serveur étaient ainsi contournables sans passer par l'app :
--     - subscriptions.destination : le moteur n8n envoie le digest à cette
--       adresse telle quelle, depuis l'expéditeur Brevo validé. Un utilisateur
--       pouvait transformer l'app en relais d'emails vers des tiers.
--     - profiles.plan : le gating Free/Pro devenait du libre-service.
--     - usage_log.cost_usd : une ligne négative annulait le plafond de dépense.
--
-- PRÉREQUIS (déjà fait) : toutes les écritures de l'app sur ces tables passent
--   désormais par la clé service, avec un filtre de propriété explicite
--   `.eq("user_id", ...)` puisque cette clé ignore le RLS. Appliquer ce SQL
--   avant ce changement de code casserait la création de veille, l'édition,
--   la connexion Slack, le provisioning et le log d'usage.
--
-- Les politiques RLS de LECTURE sont conservées telles quelles : l'app en
-- dépend pour le dashboard et les routes API.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- profiles : plus personne ne s'auto-promeut
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated, anon;
-- L'identité déclarative reste modifiable par son propriétaire.
grant update (full_name, job_role) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- subscriptions : les colonnes qui pilotent l'envoi et le provisioning
--                 deviennent serveur-seulement
-- ---------------------------------------------------------------------------
-- destination     : destinataire réel du digest
-- n8n_workflow_id : identifiant passé à l'API n8n au pause/delete
-- status          : sert de compteur de veilles actives dans le gating
-- user_id         : ne doit jamais être réassignable
revoke update on public.subscriptions from authenticated, anon;
grant update (name, profile_prompt, tone, language) on public.subscriptions to authenticated;

-- La création passe par l'outil save_subscription_config, côté serveur.
revoke insert on public.subscriptions from authenticated, anon;

-- DELETE est conservé : la route /api/subscriptions/[id] supprime via le
-- client à session, et le RLS y garantit déjà la propriété.

-- ---------------------------------------------------------------------------
-- usage_log : le compteur n'est plus alimentable par le compte qu'il mesure
-- ---------------------------------------------------------------------------
drop policy if exists "log own usage" on public.usage_log;
revoke insert on public.usage_log from authenticated, anon;

-- Ceinture et bretelles : même en cas de régression, une dépense négative ne
-- peut plus annuler le plafond.
alter table public.usage_log drop constraint if exists usage_log_cost_positive;
alter table public.usage_log add constraint usage_log_cost_positive check (cost_usd >= 0);

commit;
