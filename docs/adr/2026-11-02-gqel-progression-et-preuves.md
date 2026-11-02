# ADR — GQEL V2.1 : autoriser l'essai, préserver le veto final

- **Date** : 2026-11-02.
- **Décision** : implémentée sur branche de travail ; qualification sur modèle réel restante.
- **Base** : `6fa045396e15bb3ab5d1adedcb8d64a7e5cebe11`.

## Observation

Le compte rendu du dernier essai rapporte quatre plans refusés et aucune scène : deux refus de durée, puis deux refus sémantiques.
Ce compte rendu est une observation opérateur ; les quatre artefacts bruts n'étaient pas disponibles dans le snapshot inspecté.
Le code, lui, permet de vérifier les blocages : arrêt de rédaction sur tout refus de plan, consigne de gestes déjà représentés
appliquée aussi au plan, et citations acceptées après recherche d'une sous-phrase.

Le dernier défaut a été reproduit : une citation où « refuse » est remplacé par « accepte » était rapprochée de son suffixe commun.

## Décisions

1. Une citation doit être exactement ancrée dans sa totalité ; les plusieurs extraits restent des preuves distinctes.
2. Les erreurs de protocole sont réparées localement, sous le budget partagé, sans consommer un tour de création.
3. Des schémas JSON sont transmis à Ollama. La validation runtime reste obligatoire.
4. La lecture d'un plan porte sur une causalité prévue ; la lecture finale porte sur une action effectivement écrite.
5. Le runtime propose une allocation de rythme sans réécrire silencieusement les durées estimées du plan.
6. Après une réparation de plan bornée, une autorisation provisoire peut permettre la rédaction textuelle. Elle ne produit aucune promotion.
7. Le texte entier est encore soumis aux critères durs et souples, aux vérifications et à la comparaison de versions.
8. Les brouillons partiels et complets sont conservés avant les contrôles suivants.

Un veto final sur des preuves insuffisantes reste justifié. Un veto systématique sur toute tentative imparfaite ne prouve pas un gain.
Les nouvelles options sont incluses dans le contrat figé. Les anciens contrats non recompilés conservent un comportement strict.

## Concepts GenOS concernés et portée réelle

- Contrat worker et barrière de preuves : interdiction de transformer un brouillon ou un verdict de plan en livraison acceptée.
- A-Team : responsabilité des producteurs/lecteurs, obligations ciblées ; assertion native existante conservée dans le runner de tests.
- Continuité/versionnement : conservation du meilleur texte et des brouillons, avec empreintes ; aucun nouveau reçu durable signé revendiqué.
- Budgets/stagnation : compteurs distincts mais plafonds globaux communs. Aucun nouveau droit d'appel ou d'action externe.
- Morphogenèse/AGOW/GQWF : aucune intégration native nouvelle dans ce correctif. Les champs d'intention de routage ne prouvent pas une exécution.

## Recherche et documentation externe

- [Ollama, Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs) : schéma dans `format`, validation de la réponse,
  température basse pour les sorties structurées. Consulté le 2026-11-02. Le modèle local n'a pas été exécuté ici.
- Les recherches citées dans l'ADR V2 restent des motivations de conception, pas des preuves des gains de ce correctif.

## Alternatives rejetées

- Baisser le seuil final pour obtenir un succès : ne corrige pas le livrable.
- Rescaler les chiffres de durée puis prétendre avoir corrigé le contenu : transforme une contrainte en jeu de métrique.
- Accepter un fragment commun comme preuve d'une citation : masque notamment une négation ou une inversion de sens.
- Exiger des objectifs opposés dans toute fiction : règle artistique indue.
- Multiplier les reprises sans comptabilité : gaspillage et durée imprévisible.

## Validation et limites

Voir le [rapport de validation ciblée](../06-qualite-preuves/gqel-v2-1-validation-2026-11-02.md).
Les tests positifs et négatifs établissent les transitions logicielles. Ils ne prouvent pas que les critiques d'un modèle réel sont correctes,
ni que son scénario sera réussi. Une mission complète et des lecteurs humains restent nécessaires.
