# ADR 0403 — Oracles pour les workers structurés bornés

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : workers natifs, exécution et preuve
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0399b, ADR 0400, ADR 0402, [qualification des workers](../06-qualite-preuves/qualification-workers.md)

## Contexte

Les méthodes natives `adapt_procedure`, `niche_procedure`, `host_procedure`,
`combine_candidates` et `review_synthetic_case` produisent des artefacts
déterministes, mais leur domaine d'oracle n'était pas relié à la promotion des
missions. Leur exécution n'établissait donc pas les postconditions du contrat.

## Décision

Ajouter ces méthodes au pipeline d'observation native AEIS. Chaque mission est
reliée à son binding, à son artefact et à son contrat courant. Deux processus
isolés contrôlent les mêmes obligations avec des parcours indépendants :

- les essais adaptatifs recalculent les résultats LPT par affectation des
  charges et par rejeu des charges minimales ;
- les workers spécialiste et symbiotique vérifient les postconditions subset_sum
  par bitset et par énumération, contrôlent le résultat lié au reçu, puis
  vérifient respectivement la niche ou la capacité et l'identité du contrat hôte ;
- le worker créatif recalcule les combinaisons par réduction cartésienne et par
  parcours imbriqué ;
- le worker médical compare les considérations et références par projection
  de map et par scan indexé.

Les cas adaptatifs et subset_sum restent bornés. La preuve créative porte sur
l'énumération des options fournies, pas sur la nouveauté ni la qualité des
candidats. La preuve médicale porte sur un artefact `synthetic_educational` et
ses références, pas sur un diagnostic, un traitement ou une validation clinique.
L'adaptation n'établit pas l'optimalité globale de LPT.

## Conséquences

### Positives

- Les cinq méthodes peuvent passer C2/C3 sans dépendre d'un fournisseur de
  modèle, puisque leurs exécuteurs natifs sont déterministes.
- Les contrôles refusent un résultat ou une référence altérés et restent liés
  au run courant.

### Négatives

- La qualification couvre seulement les postconditions calculables des
  fixtures bornées ; elle ne valide pas la créativité générale, la clinique,
  l'optimalité LPT ni la vérité externe des sources.
- Le service de modèle local reste indisponible dans l'environnement Windows
  courant, ce qui n'affecte pas ces exécutions natives déterministes.

## Alternatives

- Laisser ces types `unmeasured` : rejeté, car les exécuteurs natifs existent
  déjà et les contrats exposent des postconditions calculables.
- Promouvoir sur la validation du seul artefact : rejeté, car cela ne contrôle
  pas les résultats ni leurs liens au contrat.
