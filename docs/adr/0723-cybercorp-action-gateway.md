# ADR 0723 — CyberCorp Action Gateway

## Statut

Accepté pour le pilote.

## Date

2026-10-22

## Domaine

Sécurité, autorité d'exécution, actionneurs spécialisés.

## Décideurs

Équipe GenOS.

## Lié à

ADR 0722 (SHRE), ADR 0721a (DEO), ADR 0005 (identifiants de provenance).

## Contexte

Un modèle de langage peut proposer des explications et des actions, mais une commande libre ne constitue ni une opération autorisée ni une preuve d'état. Un actionneur doit connaître le mandat, la cible, l'état courant et les possibilités vérifiées de retour avant tout changement.

## Décision

Le gateway expose un catalogue immuable d'identifiants d'opérations et valide une forme de paramètres dédiée à chaque opération. Aucun champ de commande ou d'argument shell n'est accepté. Les actionneurs sont enregistrés par le runtime serveur pour une opération connue; l'absence de raccordement échoue en mode fermé.

Chaque exécution est liée au principal authentifié, au mandat résolu côté serveur, à la cible exacte, à sa date d'expiration, à l'état courant attendu, aux préconditions et à une clé d'idempotence persistée. Les modifications exigent un reçu d'inspection attestant une sauvegarde vérifiée, son digest, un chemin de retour documenté et un actionneur de rollback. Les opérations à risque élevé exigent une approbation humaine portée par le mandat. La suppression de comptes, journaux et sauvegardes est interdite dans le pilote.

## Conséquences

- Le catalogue décrit les opérations GPO, journaux Windows, règles pfSense et modifications bornées de VM de test, laboratoire pfSense ou GPO de domaine.
- Aucune intégration CyberCorp n'est fournie par défaut. Les actions restent indisponibles jusqu'à raccordement d'un résolveur de mandats et d'actionneurs dédiés.
- L'idempotence du gateway conserve les reçus et refuse de rejouer une exécution dont l'issue est incertaine.
- Une sauvegarde vérifiée et un chemin de retour documenté sont des préconditions des changements; le système ne promet pas de restauration si l'un manque.

## Vérification

Le catalogue et le gateway sont intégrés à l'API authentifiée du backend. Aucun résultat d'exécution CyberCorp ni benchmark n'est revendiqué tant qu'aucun actionneur n'est enregistré.
