# ADR 0164 — Placement de la racine runtime selon l'espace disponible

- **Statut** : Accepté
- **Date** : 2026-09-28

## Contexte

Les espaces de travail isolés des orchestrateurs et workers sont provisionnés sur le volume local disposant du plus grand espace libre suffisant. La racine runtime des capsules doit également éviter de retomber implicitement à côté d'un workspace situé sur un volume plus contraint, notamment pour les appels qui ne transmettent pas explicitement de racine de capsule.

## Décision

Quand aucun `capsuleRoot` n'est transmis et que `GENOS_CAPSULE_ROOT` n'est pas défini, GenOS sélectionne le volume éligible ayant le plus d'octets disponibles et y place `.genos-runtime` sous le répertoire `GenOS`. Une racine fournie explicitement reste prioritaire. Le choix réutilise le seuil de capacité et le mécanisme d'inventaire frais des volumes déjà employés pour les espaces de travail.

## Conséquences

- Les données runtime nouvelles suivent l'espace libre au démarrage de chaque capsule.
- Les capsules déjà créées ne sont pas déplacées.
- Si aucun volume ne satisfait le seuil minimal, le provisionnement échoue avec le code `WORKSPACE_DISK_SPACE_INSUFFICIENT` plutôt que de choisir silencieusement un volume saturé.
- Les chemins explicites restent adaptés aux installations qui imposent une racine dédiée.
