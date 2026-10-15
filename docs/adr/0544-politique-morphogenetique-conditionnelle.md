# ADR 0544 : compiler une politique morphogénétique conditionnelle

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : orchestration, stratégie, preuve, budget

## Contexte

Le compilateur de stratégie consultatif produit des phases heuristiques pour un
diagnostic donné. Il ne fournit pas à lui seul un objet réévaluable combinant le choix
de représentation du problème, les conditions de recomposition, les obligations de
preuve et le budget par fonction.

## Décision

Ajouter un compilateur pur et réévaluable reliant les signaux à une représentation,
au portefeuille topologie/variant existant, à un roster de workers existants, à des
obligations probatoires et à des plafonds de budget et d'arrêt. La réévaluation
consomme les nouvelles observations et le budget restant; un reçu vérifié ne termine
la politique que pour le même périmètre.

Les propositions restent consultatives. Sans calibration, le classement conserve
`NO_CHANGE`. Cette brique ne crée pas de workers ou daemons, ne modifie pas les leases
et n'accorde aucune autorité d'exécution. L'orchestrateur appelant demeure responsable
de l'admission runtime et de la persistance.

## Conséquences

- Une politique peut changer de représentation quand l'incertitude, la contradiction,
  l'ambiguïté causale ou le risque de provenance évolue.
- Les preuves et parts de budget sont explicites et testées avec des observations
  successives.
- Les estimateurs restent des heuristiques; cette décision ne prouve pas que la
  sélection adaptative améliore les résultats métier.

## Alternatives

- Étendre seulement les phases fixes du compilateur existant : rejeté, car cela ne
  matérialise pas une politique complète réévaluable.
- Autoriser directement la recette classée : rejeté, faute de calibration, d'état
  runtime frais et de preuves de transition restaurable.
