-- Migration 0002 : déduplication et fraîcheur du moteur Veille Engine
-- Idempotente : peut être rejouée sans effet de bord.
-- À coller dans le SQL Editor Supabase AVANT (ou en même temps que) les
-- patchs n8n : le nouveau select du node « Charger la config » référence
-- title_key et l'insert écrit url_norm/title/title_key — sans ces colonnes,
-- le moteur échoue à chaque exécution.
-- Date : 2026-07-11 (ajustée après vérification de la prod : la contrainte
-- unique (subscription_id, url_hash) existe déjà, on ne la recrée pas).

-- ─────────────────────────────────────────────────────────────────
-- 1. NOUVELLES COLONNES sur delivered_items
-- ─────────────────────────────────────────────────────────────────

-- url_norm : URL normalisée par le moteur (NULL pour l'historique — ok,
--            le JS gère les deux formats via triple-clé).
-- title / title_key : dédup par similarité de titre (même news reprise
--            par plusieurs médias).
ALTER TABLE delivered_items
  ADD COLUMN IF NOT EXISTS url_norm  text,
  ADD COLUMN IF NOT EXISTS title     text,
  ADD COLUMN IF NOT EXISTS title_key text;

-- ─────────────────────────────────────────────────────────────────
-- 2. url_hash vides hérités → NULL
--    La contrainte unique existante (delivered_items_subscription_id_url_hash_key)
--    autorise les NULL multiples (NULLS DISTINCT), pas les '' multiples.
--    C'est aussi ce qui permet à l'upsert-ignore PostgREST
--    (on_conflict=subscription_id,url_hash) de fonctionner proprement.
-- ─────────────────────────────────────────────────────────────────

UPDATE delivered_items SET url_hash = NULL WHERE url_hash = '';

-- ─────────────────────────────────────────────────────────────────
-- 3. INDEX pour la dédup par titre et le chargement de l'historique
-- ─────────────────────────────────────────────────────────────────

-- Pas unique : deux articles différents peuvent partager une empreinte
-- de titre proche (faux positif acceptable) ; on teste juste la présence.
CREATE INDEX IF NOT EXISTS idx_delivered_items_sub_titlekey
  ON delivered_items (subscription_id, title_key)
  WHERE title_key IS NOT NULL;

-- Le moteur charge les 800 derniers items triés par date : cet index
-- évite un scan complet à chaque exécution.
CREATE INDEX IF NOT EXISTS idx_delivered_items_delivered_at
  ON delivered_items (subscription_id, delivered_at DESC);
