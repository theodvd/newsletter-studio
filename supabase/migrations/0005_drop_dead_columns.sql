-- ============================================================================
-- 0005 : retrait des colonnes devenues mortes
-- ============================================================================
-- - subscriptions.n8n_workflow_id : le moteur est passé dans le dépôt, il n'y
--   a plus un workflow n8n par utilisateur à référencer.
-- - profiles.plan : il n'y a plus de plan payant. Le modèle est le BYOK, et
--   les bornes restantes sont les mêmes pour tout le monde.
--
-- Sans risque : plus aucune ligne de code ne lit ces colonnes.
-- ============================================================================

begin;

alter table public.subscriptions drop column if exists n8n_workflow_id;

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles drop column if exists plan;

commit;
