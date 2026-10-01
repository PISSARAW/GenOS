# ADR 0260 — Sélection des modes cognitifs par regret prédictif

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, regret prédictif, contrôle cognitif
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0006, ADR 0240, ADR 0257, ADR 0259

## Contexte

AGOW arbitrait les candidats mais n'offrait pas un choix commun entre agir, observer,
vérifier, rappeler, simuler, réorganiser, consolider ou s'abstenir. Des seuils simples
sur l'incertitude ignoreraient le coût, l'urgence, la réversibilité et la confiance du
Self-Twin.

## Décision

`cognitiveModePolicyService.evaluate` estime la perte future pour les huit modes à partir
des signaux de risque et des coûts fournis, puis choisit le coût estimé minimum. Chaque
estimation reste consultable par mode pour calculer un regret réalisé après l'outcome.
`observeOutcome` calcule l'erreur prédictive sans muter l'état global. Les pertes et poids
initiaux ne sont pas calibrés; la provenance l'indique. Le service propose un mode et ne
déclenche ni outil, ni modification, ni abstention effective.

## Conséquences

- Les décisions peuvent comparer explicitement les opérations cognitives selon une perte
  multicritère.
- Les intégrateurs conservent l'autorité d'exécution et doivent fournir des estimations de
  coût adaptées à leur runtime.
- Une campagne de calibration reste nécessaire avant d'interpréter ces pertes comme des
  performances empiriques.

## Alternatives

- Choisir le mode avec des seuils rigides d'incertitude : rejeté, car ces seuils ne
  comparent pas le risque à l'urgence et aux coûts.
- Laisser AGOW exécuter automatiquement le mode choisi : rejeté, car une décision de
  politique ne fournit pas à elle seule l'autorité ni l'exécuteur sûr requis.
