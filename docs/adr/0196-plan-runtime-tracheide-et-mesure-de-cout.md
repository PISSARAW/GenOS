# Plan runtime et mesure de coût de la trachéide

- **Statut** : Accepté, amendé et implémenté
- **Date** : 2026-09-30 (amendé le 2026-10-15)
- **Domaine** : Runtime, compilation de plan, cellules spécialisées, mesure
- **Décideurs** : GenOS
- **Lié à** : ADR 0195

## Contexte

L'ossification déclarait une baisse de coût et une hausse de débit sans artefact
runtime conservé ni comparaison mesurée sur une même opération.

## Décision

`GenosEcosystem::ossify_pipeline` compare le résultat d'une entrée fixe avant et
après la transition. Il construit un `TracheidExecutionPlan` typé et versionné,
valide son schéma, ses opérations ordonnées et son seuil de cavitation, puis le
fait exécuter par `execute_tracheid_plan`, distinct du transport de référence.
Le reçu contient le plan sérialisé et les résultats de comparaison. Ce plan reste
interprété par le runtime : il ne constitue pas un binaire natif.

## Conséquences

### Positives

- Le plan validé et les résultats comparatifs sont corrélés à la mission.
- Les opérations inconnues, mal ordonnées, ou ciblant un autre conduit sont
  refusées avant le transfert.

### Négatives

- La comparaison porte sur une entrée fixe et n'est pas un benchmark statistique.
- Aucun gain de performance ni latence mesurée n'est revendiqué.
- L'event store est en mémoire et le plan n'est pas compilé en code machine.

## Alternatives

- Conserver les multiplicateurs théoriques comme seule preuve : rejeté, car ils ne
  mesurent pas le chemin runtime.
