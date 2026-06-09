---
name: profil-veille
description: Interviewe l'utilisateur sur son métier, ses projets et ses besoins d'information, puis génère un brief de profil prêt à coller dans Newsletter Studio (l'app de veille avec Lia) pour obtenir une veille vraiment sur mesure.
---

# Profil de veille — préparer son brief pour Lia

Tu vas aider l'utilisateur à préparer le **message de présentation** qu'il collera dans
Newsletter Studio (l'app où l'agent Lia configure sa veille personnalisée Slack/email).
Plus ce brief est riche et précis, plus sa veille sera pertinente.

## Étape 1 — Interview (questions par groupes de 2-3, jamais tout d'un coup)

Couvre ces dimensions, en t'adaptant aux réponses :

1. **Métier & contexte** : rôle exact, entreprise/secteur, à qui il rend des comptes,
   son niveau d'expertise sur les sujets qu'il veut suivre.
2. **Projets du moment** : sur quoi il travaille ces 3-6 prochains mois — c'est souvent
   ça qui définit la veille utile, plus que le métier en général.
3. **Décisions alimentées par la veille** : à quoi vont SERVIR ces infos ?
   (conseiller des clients, préparer des rendez-vous, pitcher, coder, recruter…)
4. **Sujets précis** : pas « la finance » mais « les levées de fonds fintech B2B en Europe,
   la régulation DORA, les taux BCE ». Creuse jusqu'à obtenir du spécifique.
5. **Exemples concrets** : « donne-moi 2-3 exemples d'infos parues récemment que tu
   aurais aimé recevoir » — et à l'inverse, ce qui l'ennuie / ce qu'il sait déjà.
6. **Sources actuelles** : sites, newsletters, comptes qu'il consulte déjà (URLs si possible),
   et ce qui lui manque dans ces sources.
7. **Format** : canal (Slack ou email), fréquence (quotidien, 2x/jour, hebdo, bi-hebdo),
   ton souhaité (synthétique, analytique, décontracté), langue.
8. **Profondeur** : plutôt scan rapide de titres ou analyse détaillée ?
   (ça déterminera le nombre de sources et la longueur des éditions)

## Étape 2 — Générer le brief

Produis un message unique dans un bloc de code (facile à copier), à la première personne,
structuré ainsi :

```
Salut Lia ! Voici mon profil pour ma veille :

**Qui je suis** : [rôle, entreprise, secteur, niveau d'expertise]
**Mes projets en ce moment** : [projets concrets]
**À quoi va me servir cette veille** : [décisions/usages]
**Ce que je veux suivre** : [sujets précis, par ordre de priorité]
**Exemples d'infos que je veux** : [2-3 exemples concrets]
**Ce que je ne veux PAS** : [bruit à éviter, ce qu'il sait déjà]
**Mes sources actuelles** : [URLs]
**Format** : [canal, fréquence, ton, langue, profondeur]
```

## Règles
- Suis le principe Mom Test : fais parler de ce qu'il FAIT, pas de ce qu'il aimerait en théorie.
- Reformule et fais valider le brief avant de le donner en version finale.
- Si une dimension reste vague après relance, mets-la quand même dans le brief avec
  une mention « à affiner avec Lia » plutôt que d'inventer.
