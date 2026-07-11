# Checklist d'application — Correctifs Veille Engine

> Ordre obligatoire : SQL d'abord, puis n8n. Ne pas inverser.

---

## Étape 1 — Appliquer la migration SQL (Supabase)

1. Aller dans le [dashboard Supabase](https://supabase.com/dashboard/project/votre-projet) > **SQL Editor**.
2. Ouvrir le fichier `supabase/migrations/0002_dedup.sql` (dans le dépôt).
3. Copier-coller tout le contenu dans l'éditeur SQL.
4. Cliquer **Run**.
5. Vérifier qu'aucune erreur n'apparaît dans la console.
   - Si tu vois `already exists` sur les index → normal, la migration est idempotente, c'est correct.
   - Si tu vois une erreur sur le DELETE → vérifier que la table `delivered_items` existe.
6. Vérifier en console que les nouvelles colonnes existent :
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'delivered_items'
   ORDER BY ordinal_position;
   ```
   Tu dois voir : `url_norm`, `title`, `title_key` en plus des colonnes existantes.

---

## Étape 2 — Ouvrir le workflow dans n8n

1. Aller sur [https://n8n.exemple.com](https://n8n.exemple.com).
2. Ouvrir le workflow **Veille Engine** (`FcWnRuCpmFOhO002`).
3. S'assurer que le workflow est en mode **édition** (non actif pendant les modifications).

---

## Étape 3 — Modifier le select du node "Charger la config"

1. Cliquer sur le node **Charger la config**.
2. Aller dans **Query Parameters**.
3. Trouver le paramètre dont le nom est `select`.
4. Remplacer sa valeur par le contenu du fichier `n8n/patches/charger-la-config.txt` :

   ```
   *,sources(*),delivered_items(url,url_hash,title_key),profiles(email,full_name,job_role)
   ```

   > Changement : ajout de `url_hash,title_key` dans la sous-sélection `delivered_items`.
   > Les deux autres paramètres du node (`delivered_items.order` et `delivered_items.limit`) restent inchangés.

5. Cliquer **Save** (icône disquette en haut).
6. Vérifier que les credentials Supabase sont toujours assignés sur ce node (badge vert).

---

## Étape 4 — Remplacer le code du node "Parser et filtrer"

1. Cliquer sur le node **Parser et filtrer**.
2. Ouvrir l'onglet **Code** (ou le champ JS Code).
3. Sélectionner tout le code existant (Ctrl+A ou Cmd+A) et supprimer.
4. Coller intégralement le contenu du fichier `n8n/patches/parser-et-filtrer.js`.
5. Cliquer **Save**.

---

## Étape 5 — Remplacer le code du node "Préparer le log"

1. Cliquer sur le node **Préparer le log**.
2. Ouvrir l'onglet **Code**.
3. Sélectionner tout et supprimer.
4. Coller intégralement le contenu du fichier `n8n/patches/preparer-le-log.js`.
5. Cliquer **Save**.

---

## Étape 6 — Activer "Continue on Fail" sur les 3 nodes d'envoi

> C'est la correction du Bug 2 : si un envoi échoue, le logging s'exécute quand même.

Pour chacun des 3 nodes suivants :
- **Envoyer via webhook Slack**
- **Envoyer sur Slack**
- **Envoyer par email**

Faire :
1. Cliquer sur le node.
2. Aller dans l'onglet **Settings** (icône engrenage, en haut à droite du panneau du node).
3. Trouver l'option **On Error** (ou "Error Handling").
4. Changer la valeur sur **Continue** (= "Continue on Fail").
5. Cliquer **Save**.

> Note : activer "Continue on Fail" déclenche un PUT du workflow complet dans n8n.
> Après avoir sauvegardé, vérifier immédiatement que les credentials sont toujours
> assignés sur TOUS les nodes qui en ont besoin (voir Étape 8).

---

## Étape 7 — Configurer le node "Logger les items envoyés" en upsert-ignore

Le node insère dans `delivered_items`. Avec l'index unique créé par la migration,
une insertion en doublon lèverait une erreur. On configure le node en **upsert-ignore**
via PostgREST pour qu'il ignore les conflits silencieusement.

1. Cliquer sur le node **Logger les items envoyés**.
2. Dans **Query Parameters**, ajouter un paramètre :
   - Nom : `on_conflict`
   - Valeur : `subscription_id,url_hash`
3. Dans **Header Parameters**, modifier le header `Prefer` existant :
   - Ancienne valeur : `return=representation`
   - Nouvelle valeur : `return=representation,resolution=ignore-duplicates`

   > Si le header `Prefer` n'existe pas encore, l'ajouter avec cette valeur complète.
   > On GARDE `return=representation` : si un node aval lit la réponse de cet
   > insert, retirer le body casserait son input. Les deux directives sont
   > compatibles (PostgREST les combine).

4. Cliquer **Save**.

---

## Étape 8 — Vérifier les credentials après les modifications

Après toute sauvegarde (notamment les étapes 6 et 7 qui font un PUT), vérifier
que chaque node ci-dessous a bien son credential assigné (badge **vert**) :

| Node | Credential |
|------|-----------|
| Charger la config | Supabase API |
| Appel Claude | Anthropic API |
| Envoyer sur Slack | Slack API (bot token) |
| Envoyer par email | Brevo (SendInBlue) API |
| Logger la delivery | Supabase API |
| Logger les items envoyés | Supabase API |

Si un badge est **rouge** ou **gris** : cliquer sur le node > onglet Credentials > réassigner.

---

## Étape 9 — Run de test

1. S'assurer que la subscription de test existe avec l'ID :
   `22222222-2222-4222-8222-222222222222`
2. Cliquer **Test workflow** en haut du canvas.
3. Dans le node **Reçoit subscription_id**, saisir :
   ```json
   { "subscription_id": "22222222-2222-4222-8222-222222222222" }
   ```
4. Suivre l'exécution node par node.

### Ce qu'il faut vérifier

**Dans "Parser et filtrer" :**
- Les items ont les champs `url_norm` et `title_key`.
- Les items sans date sont absents si la fréquence est quotidienne (lookback ≤ 48h).
- La console affiche "X articles candidats" > 0 (ou "aucun article frais" si c'est une vraie semaine calme).

**Dans "Préparer le log" :**
- `items_rows` contient les champs `url`, `url_hash`, `url_norm`, `title`, `title_key`.
- `url` correspond à une URL de flux RSS (pas une URL modifiée par Claude).

**Dans Supabase (après le run), vérifier dans `delivered_items` :**
```sql
SELECT url, url_hash, url_norm, title, title_key, delivered_at
FROM delivered_items
WHERE subscription_id = '22222222-2222-4222-8222-222222222222'
ORDER BY delivered_at DESC
LIMIT 20;
```
- `url_hash` et `url_norm` doivent être remplis (format `https://`, sans www).
- `title_key` doit contenir les mots-clés du titre en minuscules sans accents.

**Relancer le même run une 2e fois :**
- Le digest doit être vide (ou très court) car les mêmes articles sont maintenant dans `delivered_items`.
- Aucun doublon ne doit apparaître dans `delivered_items` (grâce à l'upsert-ignore).

---

## Comportement attendu en cas d'articles insuffisants

Si `Parser et filtrer` retourne 0 article (tous les articles frais ont déjà été envoyés,
ou le flux est vide sur la fenêtre de temps) :

- Le moteur s'arrête proprement après "Parser et filtrer" (return []).
- Aucun appel Claude, aucun envoi, aucun logging.
- C'est le comportement **voulu** : mieux vaut ne rien envoyer qu'envoyer de vieux liens.

Si le code existant contenait un mécanisme de "fallback" qui réinjectait du vieux contenu
(articles non filtrés comme dernier recours) : ce fallback est **neutralisé** dans le nouveau
code — la fonction retourne [] explicitement avec un message console explicatif.

Un digest court (1-2 items frais) est préférable à un digest avec du contenu périmé.
Si la veille est trop courte trop souvent, la solution correcte est d'élargir la fenêtre
de fraîcheur (`lookbackHours`) ou d'ajouter des sources — pas de réinjecter du vieux contenu.
