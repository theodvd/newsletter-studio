-- Migration 0002 : déduplication et fraîcheur du moteur Veille Engine
-- Idempotente : chaque instruction utilise IF NOT EXISTS / ON CONFLICT safe.
-- À appliquer une seule fois via le SQL Editor Supabase ou la CLI.
-- Date : 2026-07-11

-- ─────────────────────────────────────────────────────────────────
-- 1. NOUVELLES COLONNES sur delivered_items
-- ─────────────────────────────────────────────────────────────────

-- url_norm : URL normalisée côté applicatif (remplie par le JS du moteur
--            à partir de maintenant ; NULL pour l'historique — ok, le JS
--            gère les deux formats via triple-clé).
ALTER TABLE delivered_items
  ADD COLUMN IF NOT EXISTS url_norm  text,
  ADD COLUMN IF NOT EXISTS title     text,
  ADD COLUMN IF NOT EXISTS title_key text;

-- ─────────────────────────────────────────────────────────────────
-- 2. NETTOYAGE DES DOUBLONS EXISTANTS
--    On garde la ligne la plus ANCIENNE par (subscription_id, url_hash)
--    — c'est la vraie première livraison, la moins risquée à conserver.
--    Les lignes plus récentes avec le même couple sont supprimées.
-- ─────────────────────────────────────────────────────────────────

DELETE FROM delivered_items
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY subscription_id, url_hash
        ORDER BY delivered_at ASC  -- garde la plus ancienne
      ) AS rn
    FROM delivered_items
    WHERE url_hash IS NOT NULL
      AND url_hash <> ''
  ) ranked
  WHERE rn > 1
);

-- Doublons sans url_hash (lignes héritées avant la colonne url_hash) :
-- On les dédoublonne sur (subscription_id, url) à défaut.
DELETE FROM delivered_items
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY subscription_id, url
        ORDER BY delivered_at ASC
      ) AS rn
    FROM delivered_items
    WHERE (url_hash IS NULL OR url_hash = '')
      AND url IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- ─────────────────────────────────────────────────────────────────
-- 3. INDEX UNIQUE sur (subscription_id, url_hash) — après dédoublonnage
--    Cet index sert de garde-fou côté base ; l'upsert PostgREST du moteur
--    utilisera on_conflict=subscription_id,url_hash + Prefer: resolution=ignore-duplicates.
--    ATTENTION : l'index doit être COMPLET (pas partiel), sinon PostgREST
--    génère ON CONFLICT (subscription_id, url_hash) sans prédicat et Postgres
--    ne peut pas inférer un index partiel → erreur à l'insert.
--    Les NULL multiples restent permis (NULLS DISTINCT, défaut Postgres).
-- ─────────────────────────────────────────────────────────────────

-- Normalise les url_hash vides hérités en NULL pour ne pas violer l'unicité.
UPDATE delivered_items SET url_hash = NULL WHERE url_hash = '';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_delivered_items_sub_urlhash
  ON delivered_items (subscription_id, url_hash);

-- ─────────────────────────────────────────────────────────────────
-- 4. INDEX SIMPLE sur (subscription_id, title_key) — dédup par titre
--    Pas unique car deux articles différents peuvent partager des mots-clés
--    similaires (faux positif acceptable) ; on utilise juste une présence/absence.
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_delivered_items_sub_titlekey
  ON delivered_items (subscription_id, title_key)
  WHERE title_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 5. INDEX sur delivered_at pour les requêtes de fraîcheur (ordre desc)
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_delivered_items_delivered_at
  ON delivered_items (subscription_id, delivered_at DESC);
