# ADR 0287 — Séparer le pilote de la qualification confirmatoire

## Statut

Acceptée.

## Date

2026-10-03.

## Domaine

Benchmarks, reproductibilité et qualification expérimentale.

## Décideurs

Équipe GenOS.

## Lié à

ADR 0275, 0278 et 0286.

## Contexte

Les résultats de campagne enregistraient parfois `confirmatoryEligible` à partir du
seul état propre du dépôt. Des artefacts plus anciens indiquent aussi trois
répétitions requises et zéro répétition effectuée. Le runner actuel exécute chaque
mission une fois dans le protocole pilote; l'état du dépôt ne prouve ni les
répétitions ni la réussite de la campagne.

## Décision

Les résultats distinguent la qualification `pilot` et la qualification
`confirmatory`, enregistrent séparément les répétitions requises et réalisées, et
ne positionnent `confirmatoryEligible` à vrai que si le protocole est déclaré
confirmatoire, si le nombre requis de répétitions est atteint, si les vérifications
de campagne passent et si l'arbre source est propre. Le runner pilote écrit donc
explicitement une qualification pilote et n'est pas confirmatoire.

## Conséquences

### Positives

- Un dépôt propre ne peut plus faire passer une exécution unique pour un résultat
  confirmatoire.
- Les rapports exposent les conditions qui restent à satisfaire.
- Les règles de qualification peuvent être testées sans lancer toute la campagne.

### Négatives

- Le runner n'exécute pas encore automatiquement trois campagnes indépendantes;
  il rapporte honnêtement une qualification pilote.
- Une future exécution confirmatoire devra garantir l'isolation de chaque répétition.

## Alternatives

- Déduire la qualification de `sourceState.workingTreeClean` : rejeté, car cela
  confond la provenance du code et la réplication expérimentale.
- Laisser le champ absent : rejeté, car les consommateurs pourraient continuer à
  interpréter l'absence comme une qualification implicite.
