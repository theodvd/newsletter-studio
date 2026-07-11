# Newsletter Studio

App de création de veilles personnalisées : chaque utilisateur configure sa newsletter (email) ou ses alertes (Slack) en discutant avec **Lia**, un agent Claude qui recherche et valide les sources (Exa + autodiscovery RSS), puis provisionne automatiquement un workflow n8n.

## Architecture

```
App Next.js (ce repo, self-hosted)
 ├─ /onboarding  → chat avec Lia (Claude + tools exa_search, exa_find_similar,
 │                 validate_source, save_subscription_config)
 ├─ /dashboard   → mes veilles : pause / reprise / suppression, historique
 ├─ /api/provision → crée le workflow fin n8n et l'active
 └─ Supabase (projet votre-projet) : auth magic link + tables
     profiles, subscriptions, sources, deliveries, delivered_items, allowed_emails

n8n (https://n8n.exemple.com)
 ├─ 1 workflow FIN par utilisateur : Schedule Trigger (son cron)
 │   → Execute Workflow(subscription_id)        ← créé par /api/provision
 └─ "Veille Engine · Moteur partagé" (FcWnRuCpmFOhO002) :
     config Supabase → fetch sources → fraîcheur + dédup → Claude
     → rendu Slack Block Kit ou HTML → Slack / Brevo → logs + Langfuse
```

## Setup

### 1. Variables d'environnement
```bash
cp .env.example .env.local   # dev (ou .env pour docker)
```
À remplir : clés Supabase (anon + service_role, dashboard Supabase → Settings → API),
`ANTHROPIC_API_KEY`, `EXA_API_KEY` (https://exa.ai), `N8N_API_KEY` (n8n → Settings → API),
`SLACK_BOT_TOKEN` (bot scope `chat:write`), `BREVO_API_KEY`,
`SOURCE_KEY_ENCRYPTION_SECRET` (`openssl rand -hex 32`).

### 2. Credentials dans n8n (une seule fois, manuel)
Ouvrir le workflow **Veille Engine · Moteur partagé** et sélectionner dans chaque nœud :
1. **Supabase Service Role (apikey)** : à créer : type *Header Auth*, nom du header `apikey`,
   valeur = clé service_role → nœuds « Charger la config », « Logger la delivery », « Logger les items envoyés »
2. **Anthropic** (existant, Growfin) → « Appel Claude »
3. **Slack Lia Bot** : à créer : type *Slack API*, token bot `xoxb-…` → « Envoyer sur Slack »
4. **Brevo** (existant, Growfin) → « Envoyer par email »
5. **Langfuse** (existant, Growfin) → « Envoyer la trace Langfuse »

### 3. Liste blanche
Les emails autorisés à se connecter sont dans la table `allowed_emails` (Supabase).

### 4. Lancer
```bash
npm run dev                    # dev local
docker compose up -d --build   # prod sur le serveur
```

## Tester le moteur sans l'app
Une subscription de test existe en base : `22222222-2222-4222-8222-222222222222`
(email vers theo.david@audencia.com, 2 sources RSS fintech).
Dans n8n, exécuter « Veille Engine » manuellement avec ce `subscription_id` en input.

## Notes
- `n8n/growfin-reference/` : nodes Code du workflow Growfin d'origine (référence).
- La dédup des articles se fait via la table `delivered_items` (plus de Notion).
- L'expéditeur email (sender Brevo validé) est défini dans le nœud « Rendu HTML email ».
