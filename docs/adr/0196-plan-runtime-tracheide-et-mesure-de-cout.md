# Plan runtime et mesure de coût de la trachéide

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime, compilation de plan, cellules spécialisées, mesure
- **Décideurs** : GenOS
- **Lié à** : ADR 0195

## Contexte

L'ossification déclarait une baisse de coût et une hausse de débit sans artefact
runtime conservé ni comparaison mesurée sur une même opération.

## Décision

`GenosEcosystem::ossify_pipeline` compare coût et débit pour une entrée de référence
avant et après la transition, construit un plan d'exécution versionné (contrôle de
cavitation puis transfert ou blocage) et l'inclut dans le reçu avec la latence observée.
Le plan est une représentation interprétée par le runtime, pas un binaire natif.

## Conséquences

### Positives

- L'artefact de plan et les mesures comparatives sont corrélés à la mission.

### Négatives

- La mesure porte sur un échantillon de référence et n'est pas un benchmark statistique.
- L'event store est en mémoire et le plan n'est pas compilé en code machine.

## Alternatives

- Conserver les multiplicateurs théoriques comme seule preuve : rejeté, car ils ne
  mesurent pas le chemin runtime.
