# Guide d'administration — Newsletter Studio

Tout ce que tu peux modifier toi-même, sans toucher au code.

## 🔗 Les 3 consoles

| Quoi | Où |
|---|---|
| **Base de données** (emails autorisés, veilles, historique) | https://supabase.com/dashboard/project/votre-projet → **Table Editor** |
| **Workflows** (moteur, workflows par user, credentials) | https://n8n.exemple.com |
| **Observabilité** (traces des générations Claude) | https://langfuse.exemple.com (traces `veille-engine`) |

## 👥 Gérer qui peut se connecter à l'app

Supabase → Table Editor → table **`allowed_emails`** → *Insert row* avec l'email à autoriser
(ou supprimer la ligne pour retirer l'accès). C'est tout — la personne pourra ensuite
se connecter par magic link.

## 📬 Modifier une veille existante

Supabase → Table Editor → table **`subscriptions`** :
- `profile_prompt` → le profil qui personnalise chaque édition (le plus impactant)
- `frequency_cron` → ⚠️ change aussi le cron dans le **workflow fin** du user dans n8n
  (node « Planification »), sinon seul l'affichage change
- `channel` (`slack`/`email`) et `destination` (ID de channel Slack ou adresse email)
- `tone`, `language`
- `status` → utiliser plutôt les boutons Pause de l'app (ils synchronisent n8n)

Table **`sources`** : ajouter/retirer des sources d'une veille
(`subscription_id`, `url`, `feed_url` si RSS, `type` = `rss`/`scrape`, `validation_status` = `valid`).

## 🗂 Historique & déduplication

- **`deliveries`** : chaque édition envoyée (statut, articles inclus en JSON)
- **`delivered_items`** : les URLs déjà envoyées → c'est la mémoire anti-doublons.
  Pour re-tester un envoi avec les mêmes articles : supprimer les lignes de la
  subscription concernée.

## ✉️ Changer l'expéditeur des emails

n8n → workflow **Veille Engine** → node **« Rendu HTML email »** → bloc
`return { brevo_body: { sender: ... } }` (doit être un sender validé dans Brevo).

## ✍️ Ajuster le style des éditions

n8n → **Veille Engine** → node **« Construire le prompt »** : le `systemPrompt`
contient la structure et les règles (nombre d'items, ton, etc.).
Les éléments par-utilisateur (profil, ton, langue) viennent de la table `subscriptions`.

## 🧪 Tester un envoi à la main

n8n → **Veille Engine** → double-clic sur le node « Reçoit subscription_id » →
*Edit output* / pin data avec `{ "subscription_id": "<id de la veille>" }` → Execute workflow.
La subscription de test : `22222222-2222-4222-8222-222222222222`.

## 🚀 Déployer l'app sur le serveur

```bash
# .env rempli à la racine (voir .env.example)
docker compose up -d --build
```
En dev local : `npm run dev` (avec `.env.local`).

## ⚠️ Pièges connus

- **Supabase via HTTP dans n8n** : il faut le credential type *Supabase API*
  (Host + Service Role Secret) — un simple header `apikey` ne suffit pas (RLS bloque).
- **Mise à jour du moteur via l'API n8n** : efface les assignations de credentials
  de tous les nodes → les re-sélectionner après chaque update.
- **Workflows fins** : ne pas les éditer à la main sauf le cron ; toute la logique
  est dans le moteur partagé.
