# ADR 0646 — Campagne d’évolution AIDE² à double causalité

- **Statut** : Accepté pour la validation backend non promotrice
- **Date** : 2026-10-19
- **Domaine** : évolution agentique, causalité, projet, autorité, preuve
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0002, ADR 0249, ADR 0264, ADR 0613

## Contexte

Une amélioration sur le score qui a servi à sélectionner une génération ne démontre ni
une compétence générale, ni un bénéfice pour le projet. Une boucle récursive peut aussi
optimiser un proxy, contaminer son holdout ou s’auto-déclarer prête à être promue.

## Décision

GenOS scelle une campagne d’au moins trois générations avec trois corpus disjoints :
évolution, holdout et hors distribution. Le corpus d’évolution peut guider la sélection ;
les deux autres restent des surfaces de mesure. Chaque génération conserve son parent,
son évaluateur et ses mesures appariées.

Le protocole rejette les écarts de proxy supérieurs au seuil préenregistré et exige deux
preuves causales distinctes :

- un gain de compétence sur holdout, complété par un transfert OOD ;
- un gain longitudinal sur la responsabilité projet ayant motivé l’évolution, observé
  dans plusieurs contextes.

Le producteur, l’évaluateur, le vérificateur et l’autorisateur ont des identités
distinctes. Le vérificateur remet un reçu AEIS authentifié couvrant les quatre
obligations ; l’autorisateur approuve le digest de la revue. Cette approbation autorise
uniquement la présentation au gate externe. Aucun service AIDE² n’exécute la promotion.

## Conséquences positives

- L’optimisation et l’évaluation sont séparées par construction.
- Le reward hacking et l’échec de transfert bloquent la campagne.
- Une compétence sans effet sur la responsabilité source ne suffit pas.
- Les décisions indépendantes sont liées au même digest causal.

## Conséquences négatives

- Trois générations et plusieurs paires augmentent le coût expérimental.
- Les mesures métier doivent fournir un comparateur crédible et des contextes distincts.
- Le service valide des reçus et observations fournis ; il n’exécute pas les expériences.

## Alternatives

- Promouvoir le meilleur score d’évolution : rejeté, car le proxy peut être exploité.
- Utiliser seulement un holdout : rejeté, car il ne teste pas le transfert OOD ni l’effet
  longitudinal projet.
- Laisser le candidat vérifier ou autoriser sa propre promotion : rejeté, car
  l’indépendance épistémique et l’autorité seraient confondues.
