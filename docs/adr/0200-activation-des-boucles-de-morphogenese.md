# Activation des boucles de morphogenèse

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Morphogenèse, contrôle runtime, apprentissage
- **Décideurs** : GenOS
- **Lié à** : ADR 0199

## Contexte

Les boucles fast, structural et evolutionary existaient, mais le fast loop n'était
pas déclenché à la réception d'un événement et le loop evolutionary ne validait
pas un seuil de résultats vérifiés avant l'apprentissage. Ses chemins par défaut
référençaient aussi des opérations de stockage et d'apprentissage absentes.

## Décision

Chaque événement transmis à l'orchestrateur déclenche le fast loop avec son
contexte. Les décisions structurelles demandent une exécution anticipée du
structural loop, qui reste soumis à la collecte des propositions, à l'hystérésis
et à la validation du patch.

Le loop evolutionary reste lent et n'apprend qu'à partir de dix résultats
vérifiés au minimum, issus d'au moins trois signatures de problèmes distinctes.
Ces seuils sont configurables. Un résultat admissible doit avoir un reçu signé
de confiance et lier dans le digest la signature du problème, la morphologie
initiale, le modèle, le harness, l'environnement et le budget. Les observations
acceptées sont enregistrées dans le magasin d'expériences et dans la politique de
topologie vérifiée.

## Conséquences

### Positives

- Les événements peuvent déclencher une réaction rapide sans reconstruire le graphe.
- L'évolution reste inactive en l'absence d'un échantillon divers et vérifié.
- Le traitement par défaut utilise les interfaces réelles `add` et
  `recordVerifiedOutcome`.

### Négatives

- Le seuil conservateur retarde l'apprentissage pour les nouveaux domaines.
- Le magasin d'expériences par défaut est en mémoire; la persistance des résultats
  passe par le service de politique de topologie.

## Alternatives

- Apprendre de toute sortie worker : rejeté, car une sortie n'atteste pas un résultat.
- Mettre à jour immédiatement les priors à la réception d'un événement : rejeté,
  car l'événement peut être inconclusif ou non vérifié.
