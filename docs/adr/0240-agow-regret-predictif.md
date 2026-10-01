# ADR 0240 — Arbitrage AGOW par regret prédictif

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, décision, allostase, épistémologie
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0006](0006-active-global-organism-workspace.md), [ADR 0239](0239-agow-provenance-epistemique.md)

## Contexte

L'arbitrage AGOW classait les candidats par contraintes, Pareto et compétition. Il
exposait saillance, erreur, incertitude et coût, mais pas une comparaison explicite
entre la perte attendue si un candidat est traité et celle s'il est ignoré. La pression
allostatique ne doit pas devenir un score absolu capable d'écarter arbitrairement une
information essentielle.

## Décision

- Ajouter un `predictiveRegretService` qui estime séparément les pertes attendues pour
  attention et ignorance, puis calcule les regrets goal, épistémique, viabilité,
  intégrité et opportunité.
- Conserver les contraintes bloquantes comme gates dures, puis le Pareto et la
  compétition d'ignition existante. Les drives de regret enrichissent le vecteur de
  compétition; ils ne remplacent pas cette sélection par un score final unique.
- Calculer le regret épistémique à partir de l'incertitude, l'erreur de prédiction, la
  dette de preuve, la confiance causale, l'importance déclarée du belief et le nombre
  de descendants causaux déclarés.
- Réutiliser `valenceService` via `allostaticRegretAdapter`. La préemption n'est
  possible que si l'interoception précédente indique une pression grave et qu'un état
  attendu prédit une amélioration suffisante avec confiance causale minimale.
- Marquer les poids et seuils comme heuristiques non calibrés; ne produire aucune
  affirmation d'optimalité.

## Conséquences

### Positives

- L'arbitrage rend inspectable l'estimation d'une perte liée à l'ignorance.
- Une incertitude importante peut augmenter la priorité lorsqu'elle touche un belief
  important ou des descendants causaux.
- Les signaux allostatiques peuvent préempter le circuit sous une condition de
  catastrophe et de réparation attendue, sans supplanter une contrainte bloquante.

### Négatives

- Les entrées du modèle restent en partie fournies par les candidats et ne sont pas
  encore calibrées à des outcomes externes.
- Les estimations de l'état attendu sont des prédictions, pas des résultats observés.
- Les composantes supplémentaires changent la dynamique de compétition et nécessitent
  des ablations avant une activation de contrôle.

## Alternatives

- Remplacer Pareto par une somme scalaire des pertes : rejeté, car cela masquerait les
  arbitrages entre dimensions et ferait passer des poids heuristiques pour une mesure
  objective.
- Faire gagner systématiquement le candidat le plus incertain : rejeté, car
  incertitude sans importance ni coût d'ignorance est insuffisante.
- Ajouter un moteur émotionnel distinct : rejeté, `valenceService` porte déjà les
  drives allostatiques fonctionnels.
