# Newsletter Studio

Une veille personnalisée, décrite en conversation plutôt que configurée dans un
formulaire. Vous expliquez votre métier et ce que vous voulez suivre à **Lia**,
un agent qui cherche les sources, vérifie qu'elles sont exploitables, puis met
en place la livraison quotidienne ou hebdomadaire, par email ou sur Slack.

**Chacun branche sa propre clé de modèle.** Vos éditions sont écrites par le
fournisseur de votre choix, avec votre clé, et vous payez ce qu'il vous facture,
c'est-à-dire quelques centimes par mois pour un digest quotidien. Il n'y a pas
d'abonnement, et l'hébergeur ne supporte aucun coût récurrent. C'est ce qui rend
ce projet tenable en open source.

## Comment ça marche

```
Next.js 14 (ce dépôt)
 ├─ /onboarding          conversation avec Lia
 │                       (recherche de sources, validation RSS, sauvegarde)
 ├─ /dashboard           mes veilles, et la connexion de ma clé API
 ├─ /api/cron/tick       déclencheur du moteur, appelé par un cron système
 └─ src/lib/engine/      le moteur, en TypeScript testable
     config → sources → fraîcheur + dédup → modèle → rendu → envoi → journal

Supabase   auth par code à 6 chiffres, Postgres, RLS
Brevo      emails transactionnels
Slack      OAuth incoming-webhook (optionnel)
```

Le moteur tournait initialement dans n8n, en 22 nœuds. Il a été ramené dans le
dépôt : un nœud Code n'est ni typé, ni testable, ni relisible en revue, et son
bac à sable réserve des surprises. Tout est maintenant du TypeScript ordinaire.

## Installation

### 1. Base de données

Créer un projet Supabase, puis exécuter `supabase/migrations/0000_schema.sql`
dans le SQL Editor. Ce fichier contient le schéma complet : tables, RLS,
privilèges par colonne et création automatique du profil à l'inscription.

Les fichiers `0001` à `0005` sont l'historique de la base d'origine. Une
installation neuve n'en a pas besoin.

Côté Auth, configurer un fournisseur SMTP (Brevo fait l'affaire) pour que les
codes de connexion partent, et mettre `{{ .Token }}` dans les gabarits
« Magic Link » et « Confirm signup ».

### 2. Variables d'environnement

```bash
cp .env.example .env.local   # ou .env pour Docker
```

Le minimum pour démarrer : les trois clés Supabase, `ANTHROPIC_API_KEY` pour
l'onboarding, `BREVO_API_KEY` avec un expéditeur validé, `CRON_SECRET` et
`SOURCE_KEY_ENCRYPTION_SECRET` (`openssl rand -hex 32` chacun).

### 3. Lancer

```bash
npm install
npm run dev
# ou, en production :
docker compose up -d --build
```

### 4. Planifier le moteur

Le moteur ne tourne pas tout seul : il faut appeler son déclencheur
régulièrement. Toutes les 5 minutes suffisent, la logique interne calcule quelle
veille est due.

```cron
*/5 * * * * curl -fsS --max-time 280 -H "Authorization: Bearer VOTRE_CRON_SECRET" https://votre-app/api/cron/tick
```

Le déclencheur est conçu pour être appelé souvent sans risque : il ne renvoie
jamais deux fois la même édition, et rattrape une échéance manquée si la machine
était éteinte, dans une fenêtre de trois heures.

## Notes d'implémentation

**La fraîcheur dépend de la cadence.** Un digest quotidien regarde 30 heures en
arrière, 78 le lundi pour couvrir le week-end, un hebdomadaire 8 jours. Un
article sans date exploitable est rejeté en fenêtre courte, car ce sont presque
toujours des contenus épinglés qui tourneraient en boucle.

**La déduplication joue sur deux clés.** L'URL normalisée (https forcé, `www.`
et paramètres de tracking retirés, reste trié) et une empreinte de titre. Si
vous touchez à `normalizeUrl`, vous invalidez tout l'historique déjà stocké et
vos lecteurs reçoivent des doublons.

**Un envoi raté ne consomme pas les articles.** Ils ne sont marqués comme
envoyés qu'après un envoi réussi, sans quoi une panne de canal les brûle
définitivement.

**Les URL fournies par les utilisateurs sont filtrées** avant toute requête
sortante (`src/lib/tools/safe-fetch.ts`) : résolution DNS préalable, refus des
plages privées, et revalidation à chaque redirection. Sans cela, l'application
sert de sonde vers le réseau interne de son hébergeur.

**Le RLS filtre les lignes, pas les colonnes.** Les colonnes qui pilotent un
comportement serveur sont retirées des privilèges d'écriture du rôle
`authenticated`, et les écritures légitimes passent par la clé service avec un
filtre de propriété explicite. Voir l'en-tête de `0000_schema.sql`.

## Licence

MIT. Voir [LICENSE](LICENSE).
