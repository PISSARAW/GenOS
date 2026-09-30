# ADR 0174 — Feedback homéostatique en contrôle et runner EAB

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Contrôle runtime, évaluation épistémique
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0173, AEIS

## Contexte

La pression épistémique et son évolution avec les preuves étaient calculées
dans `epistemicHomeostasisService`, mais n'influençaient pas la ré-arbitration
runtime. L'intégration de benchmark existante ne fournissait pas l'évaluation
des abstentions face aux pièges LoCoMo catégorie 5.

## Décision

La boucle de contrôle calcule la pression initiale à partir du profil de risque,
d'incertitude, de contradiction, de nouveauté et de qualité des preuves. Au
retour d'exécution, elle ajuste cette pression avec `feedbackEffect`, enregistre
le score de preuve et émet une inhibition de fan-out lorsque la pression atteint
le seuil adaptatif. Les décisions continuent d'être arbitrées par les règles
existantes et les cycles restent bornés.

Le runner `benchmarks/eab/run-eab.cjs` apparie les prédictions LoCoMo aux
questions catégorie 5 et rapporte abstention, couverture, réponses, F1 lexical
et écart métrique. Il exige 446 cas en mode complet. Le dataset reste externe;
aucun résultat de performance n'est revendiqué par l'ajout du runner.

## Conséquences

### Positives

- Les preuves observées modulent effectivement le contrôle des exécutions.
- L'évaluation d'abstention devient reproductible à partir des artefacts LoCoMo.
- Les rapports incomplets ne peuvent pas être confondus avec les résultats
  complets.

### Négatives

- Le rapport complet dépend du corpus LoCoMo et d'une sortie de prédictions
  contenant les 446 questions pièges.
- La détection de refus repose sur des formulations explicites et auditables.

## Alternatives

- Garder `feedbackEffect` isolé du runtime : rejeté, car le feedback ne changeait
  alors aucune décision de contrôle.
- Traiter le score F1 lexical comme métrique d'abstention : rejeté, car le gold
  `undefined` pénalise les refus correctement formulés.
