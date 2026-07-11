-- Migration 0001 : ajout du système de plans Free / Pro
-- Idempotent : peut être rejouée sans effet de bord (IF NOT EXISTS / DO $$).
-- La table profiles est créée par le trigger handle_new_user à l'inscription ;
-- on se contente d'ajouter la colonne plan et la politique RLS de lecture.

-- 1. Colonne plan sur profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro'));

-- 2. Politique RLS : chaque utilisateur peut lire son propre profil.
--    On vérifie l'existence dans pg_policies avant de créer (idempotence).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_select_own'
  ) THEN
    -- RLS doit être activé sur la table pour que les policies soient utiles.
    -- Si déjà activé, l'instruction est silencieusement ignorée.
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

    CREATE POLICY profiles_select_own
      ON profiles
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END;
$$;

-- 3. Commentaire de colonne (documentation in-database)
COMMENT ON COLUMN profiles.plan IS
  'Plan souscrit : free (défaut) ou pro. Changé manuellement en base jusqu''à intégration Stripe.';
