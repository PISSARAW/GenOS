# ADR 0414 — Approbation liée à l'action Human–AI Syncytium

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Syncytium, Human–AI, autorité humaine
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0411](0411-appelant-lie-session-syncytium.md)

## Contexte

Le service Human–AI enregistrait une approbation humaine avec le seul identifiant
de l'action. Un agent autorisé pouvait ensuite fournir un autre contenu sous ce
même identifiant. Le reçu d'exécution indiquait `executed`, alors que le service
n'effectuait aucun effet externe : il enregistrait seulement l'action dans l'état
partagé.

## Décision

L'approbation contient désormais l'identifiant de l'agent exécutant et une copie
JSON du contenu revu, limitée à 64 Kio. L'admission exige un acteur humain de la
session. L'opération `executeApprovedAction` compare l'identifiant, l'agent et le
contenu exact à cette approbation, puis consomme celle-ci dans une transaction
sérialisable liée à la version d'état lue. Les approbations anciennes dépourvues
de ces liaisons ne peuvent plus autoriser cette opération.

Le reçu créé porte `authorized_recorded` et `recordedAt`. Il atteste la
consommation de l'approbation et l'enregistrement dans le CRDT, pas l'exécution
d'un outil, d'une migration ou d'un autre effet externe. Un exécuteur externe
devra produire sa propre preuve d'effet et la lier au reçu avant toute
revendication d'exécution.

## Vérification et limites

`test_syncytium_human_ai_variant.js` couvre le refus d'une approbation sans
contenu, d'un contenu modifié et d'un autre agent, puis l'enregistrement du
contenu approuvé. Il vérifie qu'une mutation des objets d'entrée après l'appel
ne modifie pas les données enregistrées. La liaison au principal du transport
reste du ressort de la frontière MCP et de l'hôte ; ce service ne certifie pas
qu'un humain réel contrôlait ce principal. Les anciens reçus `executed` restent
des données historiques et ne deviennent pas des preuves d'effet externe.
