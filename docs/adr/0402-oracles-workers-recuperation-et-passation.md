# ADR 0402 — Oracles bornés de récupération et de passation

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : workers, récupération et coordination
- **Décideurs** : équipe GenOS
- **Lié à** : [qualification des workers](../06-qualite-preuves/qualification-workers.md), [ADR 0399](0399-oracles-observation-workers-bornes.md), [ADR 0400](0400-oracles-workers-deterministes-structures.md)

## Contexte

Les méthodes natives `restore_checkpoint` et `prepare_handoff` étaient
exécutables en C1, sans oracle branché à la promotion de mission. Un reçu de
récupération ne prouve pas que le fichier du workspace contient le checkpoint.
Une liste de références de passation ne prouve ni leur conservation, ni un
accusé du destinataire.

## Décision

Ajouter deux domaines d'observation AEIS. Pour `recovery_worker`, deux processus
indépendants relisent le fichier confiné, borné à un Mio, contrôlent son SHA-256
et recalculent le reçu de la tentative. Les stratégies lisent respectivement le
fichier entier et des blocs. Les chemins absolus, les sorties du workspace et
les liens symboliques sont refusés.

Pour `liaison_worker`, deux stratégies recalculent les références uniques depuis
les éléments scellés, les groupes et le reçu de passation. L'oracle exige que le
rapport indique `recipientAcknowledged: false`. Il atteste la préparation d'un
dossier transmis au parent, pas une livraison externe ni une réponse humaine.

## Conséquences

### Positives

- La mission de récupération peut être promue après observation réelle de
  l'état restauré et recalcul indépendant du reçu.
- La mission de passation lie les groupes et références du rapport aux entrées
  du run et empêche de prétendre à un accusé absent.

### Négatives

- Les oracles n'établissent pas que le contenu du checkpoint est souhaitable ni
  que ses sources sont authentiques.
- La passation reste locale au dossier parent ; le transport vers un destinataire
  et son accusé nécessitent une qualification séparée.
- Les missions coordonnées du `sub_orchestrator` ne sont pas couvertes ici.

## Alternatives

- Promouvoir sur la seule validation de forme : rejeté, car elle ne lit pas
  l'état restauré et ne recalcule pas les références.
- Déduire un accusé de la présence du dossier : rejeté, car le destinataire
  n'est pas observé.
