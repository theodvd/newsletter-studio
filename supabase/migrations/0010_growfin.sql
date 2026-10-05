-- ============================================================================
-- 0010 : mémoire entre éditions, modèle par veille, envoi à une liste
--        (migration de la newsletter Growfin depuis n8n)
-- ============================================================================
-- Contexte
--   Growfin, la newsletter de l'hébergeur, tournait dans un workflow n8n :
--   modifiable dans l'interface sans trace ni test, elle a perdu ses éditions
--   du jeudi pendant dix semaines (juillet à octobre 2026) à cause d'un chiffre
--   changé pour un test et jamais remis. Elle passe sur ce moteur, ce qui
--   demande trois capacités qu'il n'avait pas. Son historique (jusqu'ici dans
--   une base Notion) est repris dans `deliveries`.
--
-- 1. Mémoire entre éditions (toutes les veilles)
--   `deliveries.edition` garde l'édition complète (JSON), `deliveries.memory`
--   la ligne de mémoire que le modèle renvoie à chaque édition (angles et
--   anecdotes déjà utilisés). Le prompt reçoit les 5 dernières éditions
--   réussies : sans ça, le modèle reservait les mêmes sujets et anecdotes
--   d'une édition à l'autre.
--
-- 2. Modèle et effort par veille (`subscriptions.model`, `.effort`)
--   NULL = comportement actuel (variable ENGINE_MODEL, effort par défaut du
--   modèle). Réglés par l'opérateur uniquement.
--
-- 3. Envoi à une liste Brevo (`subscriptions.brevo_list_id`)
--   NULL = envoi à l'adresse du compte, comme avant. Renseigné, l'édition part
--   en campagne Brevo vers cette liste. Le moteur ne l'honore QUE pour les
--   comptes listés dans ENGINE_LIST_SEND_USER_IDS (côté serveur) : la colonne
--   seule ne suffit pas, pour qu'une erreur de grant ne transforme jamais le
--   service en outil d'envoi en masse.
--
-- Sécurité : les trois colonnes de `subscriptions` sont serveur-only. Elles
--   n'apparaissent PAS dans le grant update de 0003 (name, profile_prompt,
--   tone, language) et ne doivent JAMAIS y être ajoutées. `deliveries` reste en
--   lecture seule pour le client (policy « own deliveries », select).
--
-- Ordre de déploiement : SQL D'ABORD, code ensuite. Le nouveau code lit
--   `deliveries.edition` et `deliveries.memory` (historique du prompt) et les
--   écrit à chaque envoi : sans ces colonnes, chaque édition échouerait.
-- ============================================================================

begin;

alter table public.subscriptions
  add column if not exists model              text,
  add column if not exists effort             text,
  add column if not exists brevo_list_id      integer;

alter table public.subscriptions
  drop constraint if exists subscriptions_effort_valid;
alter table public.subscriptions
  add constraint subscriptions_effort_valid
  check (effort is null or effort in ('low', 'medium', 'high', 'xhigh', 'max'));

alter table public.deliveries
  add column if not exists edition jsonb,
  add column if not exists memory  text;

commit;
