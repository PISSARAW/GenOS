# 0101 — Prévol shadow et commit CAS de Morphogenèse V2

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Morphogenèse, persistance, runtime V2
- **Décideurs** : GenOS
- **Lié à** : [ADR 0076](0076-runtime-morphogenese-v2.md), [ADR 0040](0040-morphogenese-git-contrefactuel.md)

## Contexte

Le runtime V2 évalue des propositions morphologiques, mais son chemin de commit doit
rester subordonné à l'adjudication du noyau Rust et à la gouvernance. Le stockage des
graphes doit également empêcher qu'une branche concurrente écrase silencieusement une
version déjà enregistrée.

## Décision

- Le mode `shadow` exécute l'observation, le diagnostic, la synthèse, le typage, les
  contraintes et l'évaluation Pareto, puis retourne une proposition sans transition,
  crédit, mémoire ni écriture persistante.
- L'intégration au plan de mission est désactivée par défaut et activée uniquement par
  `GENOS_MORPHOGENESIS_V2_SHADOW` (`1`, `true` ou `on`). Le résultat est informatif et ne
  change pas la topologie exécutée.
- Le mode de commit exige explicitement un adaptateur `kernel.adjudicate`; la réponse
  du noyau et l'autorisation de gouvernance précèdent toute transition.
- Le stockage distingue la sauvegarde d'un instantané non engagé du commit autorisé. Un
  commit exige une décision noyau `APPLY`, une approbation de gouvernance et la version
  attendue. La comparaison et l'insertion se déroulent dans une transaction SQLite
  immédiate; un décalage produit `MORPHOLOGY_VERSION_CONFLICT`.

## Conséquences

### Positives

- Le V2 peut comparer ses propositions au plan courant sans exercer d'autorité.
- Une seule branche peut engager une version donnée; les écritures concurrentes périmées
  échouent de façon explicite.
- L'absence d'adjudicateur Rust empêche désormais le chemin de commit de démarrer.

### Négatives

- Le shadow est un prévol consultatif; il ne démontre pas qu'une transition complète
  réussirait sous l'autorité réelle.
- La mise en service du shadow demande une configuration explicite par environnement.

## Alternatives

- Autoriser le shadow à déclencher la transition : rejeté, car cela confondrait évaluation
  locale et autorité de décision.
- Écraser la dernière version en cas de course : rejeté, car cela perdrait la filiation et
  masquerait les décisions concurrentes.
