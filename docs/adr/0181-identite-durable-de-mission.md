# ADR 0181 — Identité durable de mission et succession d’orchestrateur

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Continuité, orchestration, persistance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0174, ADR 0175

## Contexte

Le noyau de continuité identifie aujourd’hui une mission par l’agent
orchestrateur racine. Cette identité disparaît avec l’agent et empêche de
transférer durablement l’organisme, les preuves et les conditions de réveil à
un orchestrateur successeur.

## Décision

1. Introduire un identifiant `missionId` persistant, distinct des identifiants
   d’agents. Les événements, contrats homéostatiques, états d’organisme et
   reprises utilisent cet identifiant comme clé de mission.
2. Persister l’orchestrateur courant et l’ensemble des agents liés à la mission.
   La filiation des workers reste portée par `parent_agent_id` ; elle ne
   remplace pas le rattachement explicite à la mission.
3. Migrer les missions historiques en utilisant leur orchestrateur existant
   comme identifiant initial, sans réécrire les clés scellées déjà persistées.
4. Faire passer l’identifiant dans les exécutions détachées et le renvoyer dans
   le résultat d’orchestration afin que les reprises puissent le fournir.
5. Marquer une mission terminée uniquement après autorisation du gate
   homéostatique. Une succession change l’orchestrateur courant, pas l’identité
   de mission.
6. Exiger l'identifiant courant de l'orchestrateur lors d'une succession et
   effectuer la mise à jour par comparaison atomique afin de rejeter deux
   successeurs concurrents.
7. Relier la dormance aux snapshots et conditions de réveil déjà persistés ;
   la mission ne passe à `dormant` qu'après confirmation de leur écriture. Un
   événement de réveil typé doit satisfaire le payload de la condition.
8. Une régénération n'est acquise qu'après création, réservation et dispatch
   d'un worker réel, puis constat d'un statut exploitable et couverture du rôle.
   Un plan ou une cellule construits en mémoire ne constituent pas un reçu de
   réparation.

## Conséquences

- Une mission peut conserver son identité après le remplacement de son
  orchestrateur.
- Les clients doivent conserver `missionId` pour demander une reprise.
- Les missions historiques restent adressables par leur identifiant racine ;
  les nouvelles utilisent un identifiant indépendant.
- L’identité persistée ne confère aucune permission et ne contourne aucun gate.

## Alternatives

- Conserver l’identifiant racine et ajouter un alias à chaque remplacement :
  rejeté, car la chaîne d’alias complique les recherches et la reprise.
- Utiliser l’identifiant d’organisme comme identifiant de mission : rejeté,
  car organisme et mission ont des cycles de vie et des responsabilités
  distincts.
