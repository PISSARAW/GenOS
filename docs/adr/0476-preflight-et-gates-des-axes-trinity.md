# ADR 0476 — Préflight des variantes et gates d’évidence Trinity

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Trinity, variantes expérimentales, preuve et promotion.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0279, différenciation effective des variantes; ADR 0281, audit de preuve Trinity.

## Contexte

Le catalogue Trinity déclarait certaines politiques implémentées même lorsque
leurs exécuteurs exigeaient des nombres de mondes incompatibles. Le dispatch
pouvait alors engager du budget avant que la comparaison ne découvre que le
plan était inexécutable. Des gates acceptaient aussi des reçus de forme valide
sans authentifier leur émetteur, et une concession adversariale pouvait laisser
une synthèse inchangée passer le gate.

## Décision

La compilation du design rejette les combinaisons qui n’ont pas de contrat
d’exécution compatible. Les politiques qui n’ont pas encore d’exécuteur complet,
dont `multi_horizon_grid`, restent non implémentées et échouent au préflight.
L’ordre des cellules factorielles est randomisé; les axes exposés doivent
correspondre aux traitements réellement exécutés.

Les reçus comptés comme preuve doivent être signés avec un vérificateur de
confiance enregistré. Une revue adversariale ne passe que si chaque attaque est
réfutée avec des identifiants d’évidence authentifiés du monde défenseur; une
concession ou clarification escalade le résultat tant que l’affirmation et la
synthèse n’ont pas été révisées.

Les analyses contrefactuelles issues uniquement de prompts sont nommées
« sensibilité aux prompts conditionnels » et ne revendiquent pas d’attribution
causale. La divulgation d’incertitude ne réduit pas le score de robustesse.

## Alternatives

- Lancer les variantes puis escalader à la fin : rejeté, cela dépense le budget
  sur un plan déjà connu comme inexécutable.
- Accepter une concession comme résolution : rejeté, la conclusion calculée
  peut encore contenir l’affirmation concédée.
- Traiter les reçus worker comme confiance implicite : rejeté, un champ de statut
  fourni par le worker ne prouve pas l’exécution indépendante.
- Présenter les changements de prompt comme interventions causales : rejeté,
  aucun état du système n’est modifié ni isolé par ces prompts.

## Conséquences

- Les combinaisons non prises en charge échouent avant dispatch avec un code
  stable et un message explicite.
- La suite doit couvrir les compatibilités et les tentatives de reçu forgé.
- Les variantes multi-horizon complètes et les interventions exécutables restent
  du travail futur; elles ne doivent pas être déclarées opérationnelles avant
  que leurs affectations et preuves soient vérifiées.
