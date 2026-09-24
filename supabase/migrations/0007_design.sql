-- ============================================================================
-- 0007 : colonne `design`, pour les templates d'édition
-- ============================================================================
-- Contexte
--   Jusqu'ici, une seule mise en page existait (le template `classic`,
--   codé en dur dans le moteur). Cette colonne porte les réglages de mise en
--   page d'une veille : le template choisi (`classic` ou `editorial`), la
--   couleur d'accent, le titre d'en-tête, les sections actives (`editorial`
--   uniquement) et l'affichage des images. `resolveDesign` (côté code) sait
--   déjà lire une ligne dont `design` est `null` ou absente : elle retombe
--   sur `{ template: "classic", ... }`, exactement le rendu d'aujourd'hui.
--
-- Ordre de déploiement (IMPORTANT)
--   Le code tolère l'absence de cette colonne (`resolveDesign(undefined)` =>
--   classic) : DÉPLOYER LE CODE D'ABORD, PUIS CE SQL. Dans l'autre sens, rien
--   ne casse non plus (une colonne `design` non lue par un code plus ancien
--   est simplement ignorée), mais l'ordre code-puis-SQL est celui qui a été
--   testé et c'est celui à suivre.
--
-- Backfill : les veilles déjà lancées (actives ou en pause) gardent
--   EXPLICITEMENT `classic`, pour ne changer le rendu d'aucune veille en cours.
--   Les brouillons, jamais envoyés, passent sur `editorial` comme toute
--   nouvelle veille : personne n'a encore reçu leur rendu. Les veilles créées
--   après cette migration prennent `editorial` via le DEFAULT posé ensuite.
--
-- Sécurité : colonne serveur-only, par construction et pas seulement par
--   convention. Depuis 0003, le rôle `authenticated` n'a plus de privilège
--   UPDATE/INSERT au niveau table sur `subscriptions` : seul un GRANT explicite
--   par colonne (aujourd'hui `name, profile_prompt, tone, language`) rouvre
--   l'écriture. `design` n'apparaît PAS dans ce GRANT, et ne doit JAMAIS y
--   être ajouté : la mise en page se règle par une route serveur (comme
--   `destination`, `status`, `n8n_workflow_id`), jamais en écriture directe
--   PostgREST depuis le navigateur. Voir 0003 pour le rappel complet du
--   principe (RLS filtre les LIGNES, jamais les COLONNES).
-- ============================================================================

begin;

alter table public.subscriptions add column if not exists design jsonb;

update public.subscriptions
   set design = case
                  when status = 'draft' then '{"template":"editorial"}'::jsonb
                  else '{"template":"classic"}'::jsonb
                end
 where design is null;

alter table public.subscriptions
  alter column design set default '{"template":"editorial"}'::jsonb;

alter table public.subscriptions
  alter column design set not null;

alter table public.subscriptions drop constraint if exists subscriptions_design_is_object;
alter table public.subscriptions add constraint subscriptions_design_is_object
  check (jsonb_typeof(design) = 'object');

-- Pas de GRANT ici : `design` reste hors des colonnes accordées à
-- `authenticated` (voir le bloc « Sécurité » ci-dessus). N'ajoutez jamais
-- `design` au `grant update (...)` de 0003 sans repasser par une route
-- serveur qui valide `resolveDesign` avant écriture.

commit;
