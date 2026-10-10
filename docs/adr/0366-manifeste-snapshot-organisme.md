# ADR 0366 — Manifeste vérifiable de snapshot d'organisme

- Statut : Accepté, portée backend partielle.
- Date : 2026-10-10.
- Domaine : Snapshots, cohérence, intégrité.
- Décideurs : Équipe GenOS.
- Lié à : [ADR 0365](0365-studio-boucle-production-locale.md), [référence des snapshots](../02-orchestration/workspaces-contrefactuel.md#32-snapshot-durable).

## Contexte

Les snapshots d'état d'agent peuvent déjà référencer un payload de workspace,
mais aucun contrat commun ne lie leurs empreintes ni ne décrit les organes
absents. Une capture longue peut aussi observer un changement des champs d'agent
pendant la copie du workspace.

## Décision

Ajouter aux nouveaux snapshots et commits d'agent un manifeste versionné stocké
dans `state_json`. Il lie par SHA-256 les champs d'agent restaurables, la
référence et l'empreinte du workspace, l'instant de capture et le statut des
composants. La capture relit les champs restaurables de l'agent après la copie;
si leur empreinte a changé, elle échoue sans publier le snapshot d'état.

La restauration vérifie l'empreinte du manifeste avant tout effet. Les anciens
snapshots sans manifeste gardent leur comportement historique et sont marqués
comme non vérifiés par le vérificateur. Le manifeste nomme aussi les limites
connues : runtime, contexte LLM, mémoires/relations et checkpoint d'orchestrateur
ne sont pas capturés par cette API.

## Conséquences

Le contrat est additif et ne nécessite pas de migration SQL. La barrière prouve
la stabilité des champs d'agent pendant la capture et le payload workspace
conserve sa propre vérification; elle ne constitue pas une transaction atomique
globale avec les autres organes ou les processus en cours. Une future extension
pourra rattacher des reçus d'organes au manifeste sans prétendre les restaurer
tant qu'ils ne disposent pas de contrats durables.

## Alternatives

- Ajouter immédiatement les mémoires, relations et checkpoints Rust au même
  snapshot : écarté, car ces composants n'ont pas encore de contrat partagé de
  capture, de vérification et de restauration dans cette API.
- Présenter les références existantes comme un snapshot global : écarté, car
  cela masquerait les états qui ne sont pas persistés ou restaurables.
