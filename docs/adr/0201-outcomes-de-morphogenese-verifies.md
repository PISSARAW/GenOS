# Outcomes de morphogenèse vérifiés

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Morphogenèse, apprentissage, provenance
- **Décideurs** : GenOS
- **Lié à** : ADR 0200

## Contexte

Le loop évolutionnaire reçoit des preuves signées, mais les expériences stockées
ne préservaient pas le contexte suffisant pour expliquer quelle morphologie,
quelle exécution et quel environnement avaient produit un résultat. Apprendre
depuis une auto-évaluation de modèle ou une sortie non liée à son exécution serait
une fuite épistémique.

## Décision

Définir `MorphologyOutcome` comme un enregistrement normalisé contenant la
signature du problème, la morphologie initiale et ses transitions, le modèle, le
harness, l'environnement, le budget, le résultat, la force de vérification, les
coûts, la latence, les tokens, les échecs et le reçu source.

Le constructeur n'accepte qu'une preuve admissible validée et signée. Le digest
du reçu doit engager le `learningContext` complet ; les anciens reçus scalar-only
restent utilisables par leurs consommateurs, mais ne peuvent pas alimenter
l'apprentissage évolutionnaire. Le magasin d'expériences conserve le modèle, le
harness, l'environnement et la force de vérification avec chaque outcome.

## Conséquences

### Positives

- Chaque apprentissage peut être retracé jusqu'à un reçu et à son contexte signé.
- Les sorties et auto-évaluations non vérifiées ne deviennent pas des expériences.

### Négatives

- Les producteurs doivent signer un digest qui inclut le contexte d'apprentissage.
- Les expériences historiques sans ce contexte n'alimentent pas le nouveau loop.

## Alternatives

- Déduire la morphologie et l'environnement depuis l'état courant : rejeté, car cet
  état peut avoir changé après l'exécution.
- Apprendre des évaluations LLM seules : rejeté, car elles ne prouvent pas le résultat.
