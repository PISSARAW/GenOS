# ADR 0375 — Portabilité des snapshots mémoire

Statut : accepté pour la négociation de capacités ; backend VM proposé

Date : 2026-10-10

Domaine : snapshots, runtime, portabilité

Lié à : [ADR 0373](0373-barriere-capture-runtime-local-actif.md)

## Contexte

Le runtime actuel lance un processus enfant sur l'hôte. La pause coopérative
permet de figer un checkpoint logique, mais ne sérialise ni RAM, ni handles,
ni connexions. Les mécanismes de dump propres à un noyau ne fournissent pas
un contrat commun de reprise sous macOS, Windows et Linux. Un dump de diagnostic
ne suffit pas à redémarrer le processus avec les mêmes ressources.

## Décision

Le contrat public distingue explicitement le mode `logical` du mode
`process-memory`. `GET /api/agents/snapshot-capabilities` annonce les capacités
réelles du backend courant. Une demande de capture ou de restauration mémoire
est refusée avant mutation tant qu'aucun backend de restauration n'est intégré.
Le manifeste continue de signaler `processMemory: unsupported` ; la réponse de
restauration conserve `processMemoryRestored: false`.

L'architecture visée pour la RAM est un runtime d'agent hébergé dans une VM
supervisée par GenOS. Un backend commun pourrait employer les snapshots de VM
QEMU sur les trois hôtes. Il devra fournir, avant d'annoncer la capacité :

1. le lancement attesté de l'agent **dans** la VM liée à son identifiant ;
2. une pause coordonnée des écritures GenOS et de la VM ;
3. une capture vérifiée de la RAM, du CPU, des périphériques et des disques ;
4. une reprise vérifiée sur une configuration compatible, avec ressources
   externes revalidées et gestion des effets déjà produits ;
5. une politique de stockage, de chiffrement, de quotas et de rétention.

La simple présence de QEMU sur l'hôte ou la prise d'un snapshot d'une VM
sans association attestée avec l'agent ne satisfait pas ce contrat.

## Conséquences

Le mode logique vise Windows, macOS et Linux avec les prérequis Node.js, Rust
et modèles applicables. Les capacités mémoire sont
annoncées indisponibles sur chacun de ces hôtes. Le contexte caché du fournisseur
LLM et la restauration globale restent indépendants de ce futur backend VM.
macOS entre dans la cible du contrat produit ; sa qualification native reste à
exécuter avant toute annonce de support complet.

## Sources techniques

- [Plateformes hôtes QEMU](https://www.qemu.org/docs/master/about/build-platforms.html)
- [Snapshots de VM QEMU](https://www.qemu.org/docs/master/system/images.html#vm-snapshots)
- [Commandes QMP de snapshot](https://www.qemu.org/docs/master/interop/qemu-qmp-ref.html)
