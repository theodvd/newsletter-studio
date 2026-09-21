# Exploitation

Ce que vous pouvez régler sans toucher au code, une fois l'application en place.

## Les deux consoles

| Quoi | Où |
|---|---|
| Base de données : comptes, veilles, historique | Le Table Editor de votre projet Supabase |
| Journal du moteur | `docker logs` du conteneur, filtré sur `[engine]` |

## Vérifier que le moteur tourne

Le moteur n'a pas d'interface : il s'exécute quand le cron appelle son
déclencheur. Trois façons de contrôler qu'il va bien.

```bash
# 1. Appeler le déclencheur à la main
curl -H "Authorization: Bearer $CRON_SECRET" https://votre-app/api/cron/tick
# → {"checked":2,"due":0,"outcomes":[]}

# 2. Lire le journal du cron
tail -f /var/log/newsletter-tick.log

# 3. Regarder les exécutions applicatives
docker logs newsletter-studio --since 1h 2>&1 | grep '\[engine\]'
```

`checked` est le nombre de veilles actives, `due` celles dont l'échéance vient
de passer. Un `due` à zéro est normal la plupart du temps : les veilles ne
partent qu'à leur heure.

## Modifier une veille

Table **`subscriptions`** :

- `profile_prompt` : le profil qui personnalise chaque édition. C'est de loin le
  réglage le plus déterminant sur la qualité du résultat.
- `frequency_cron` : la cadence, interprétée dans le fuseau `ENGINE_TIMEZONE`.
  Le format accepté est volontairement étroit (minute et heures fixes, jours de
  semaine en liste ou plages), avec un plafond de 14 envois par semaine.
- `status` : préférez les boutons Pause du tableau de bord.
- `tone`, `language` : le ton et la langue de rédaction.

Table **`sources`** : ajouter ou retirer des sources
(`subscription_id`, `url`, `feed_url` si c'est un flux, `type` = `rss` ou
`scrape`, `validation_status` = `valid`).

Le destinataire d'un digest email n'est pas modifiable : il est résolu depuis
l'adresse du compte au moment de l'envoi. C'est délibéré, cela évite que
l'application serve de relais d'emails vers des tiers.

## Historique et doublons

- **`deliveries`** : une ligne par édition, avec son statut et les articles
  retenus. C'est là qu'on lit pourquoi un envoi a échoué.
- **`delivered_items`** : les articles déjà envoyés, c'est la mémoire
  anti-doublons. Pour rejouer un envoi avec le même contenu, supprimer les
  lignes de la veille concernée.

## Ajuster le style des éditions

Le prompt vit dans `src/lib/engine/prompt.ts` : structure de sortie, nombre
d'articles, règles de rédaction. Les éléments propres à chaque utilisateur
(profil, ton, langue) viennent de la table `subscriptions`.

Le prompt de l'agent d'onboarding est dans `src/lib/agent/system-prompt.ts`.

## Coûts

L'hébergeur ne paie que les conversations d'onboarding, bornées par
`onboardingCapUsd` dans `src/lib/plan.ts`. Les éditions sont facturées à chaque
utilisateur par son propre fournisseur.

`ENGINE_FALLBACK_API_KEY` permet de faire tourner des veilles sans clé
personnelle, aux frais de l'hébergeur. Laisser cette variable vide impose le
BYOK à tout le monde.

## Pièges connus

- **Déployer le SQL avant le code** casse l'application : les colonnes
  verrouillées ne sont plus accessibles aux écritures du client. L'ordre est
  toujours code, déploiement, puis SQL.
- **Changer `normalizeUrl`** invalide tout l'historique de déduplication déjà
  stocké, et provoque une vague de doublons.
- **L'expéditeur Brevo doit être validé** chez Brevo, sinon tous les envois
  échouent avec une erreur peu parlante.
