# ADR 0331 — Syncytium : rejeu causal et preuve de complétion

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : runtime Node, Syncytium, causalité, réplication, preuve
- Décideurs : maintenance GenOS
- Lié à : [contrat runtime Node/MCP](../03-reference/runtime-syncytium.md), [modèle Syncytium](../02-orchestration/topologies/syncytium.md), [protocole de preuve](../02-orchestration/topologies/protocole-missions-syncytium.md)

## Contexte

Le runtime comprend treize variants, mais un tri par horodatage ne respecte pas
les dépendances sous décalage d'horloges. Des retries avec un contenu différent,
la perte d'horloge à la compaction et les mutations en mémoire avant un échec
SQLite fragilisent l'identité et la reprise. Une opération hors ligne ne doit
pas acquérir rétrospectivement des observations du serveur. Les branches
spéculatives partagent une base causale ; leurs dots locaux peuvent donc entrer
en collision avec ceux du principal lors de la promotion.

Une réponse worker et un transport réussi ne prouvent ni la validité de l'état
partagé ni sa matérialisation. Les vues historiques doivent également préserver
les frontières de projection et ne pas exposer de références mutables internes.

## Décision

1. Rejouer les opérations par dépendances causales, avec un ordre déterministe
   pour les événements concurrents. Les admissions publiques refusent les trous
   causaux ; le rejeu interne peut reconstruire un journal livré dans le désordre.
2. Conserver une empreinte canonique de chaque mutation identifiée, y compris
   après compaction, et refuser un identifiant réutilisé avec un auteur ou un
   contenu différent. Préserver l'horloge Lamport et interdire la réutilisation
   d'un dot causal dans un même état.
3. Construire les mutations CRDT et ioniques sur un candidat, persister puis
   conserver ce candidat ; restaurer l'état précédent si la persistance échoue.
   Les transactions persistées contiennent les opérations réellement estampillées.
4. Capturer la base d'isolation lors d'une partition. Estampiller les opérations
   hors ligne avec leurs observations d'origine, évaluer leurs invariants locaux
   avant de consommer l'autorité, et empêcher le demandeur d'assouplir la politique
   du schéma. Réconcilier avant d'acquitter une file encore en attente.
5. Publier les opérations promues comme de nouveaux événements du principal,
   en conservant leur identité métier et leur journal d'origine dans la branche.
   Réévaluer autorité, conflits et invariants sur l'état principal courant.
6. Activer les runtimes spécialisés des variants par défaut dans le dispatch
   biologique. Conserver l'option explicite useVariantRuntime=false pour les
   sessions déclaratives. Les paramètres propres au variant restent nécessaires.
7. Exiger un reçu stateValidation de portée committed_shared_state : état non
   vide, invariants exécutés satisfaits, matérialisation à la version courante,
   aucune opération hors ligne en attente. La validation sémantique des workers
   reste un contrôle distinct et obligatoire pour clôturer une mission.
8. Projeter snapshots historiques, journaux et réponses de réconciliation selon
   le domaine consommateur. Copier les résultats et masquer l'état CRDT interne
   dans les snapshots projetés. Le lanceur refuse les sorties sans reçus valides.

## Conséquences

### Positives

Les erreurs de causalité, retries incompatibles, partitions et échecs de
persistance deviennent des refus explicites ou des transitions testables. Les
réparations sont matérialisées après leur commit. Le contrôle temps réel journalise
watchdog et fail-safe dans la transaction de sécurité. La suite Syncytium est
exécutée par npm test via test:syncytium, dans des processus isolés par fichier.

### Négatives et limites

Les identifiants compactés et leurs empreintes consomment une mémoire croissante.
Le reçu ne certifie ni la qualité métier générale ni la correction d'un LLM.
Le runtime local et ses tests ne prouvent pas une convergence universelle, un
consensus distribué ou toutes les équations de la fiche conceptuelle. Les
campagnes LLM et mesures distribuées nécessitent leurs propres preuves.

## Alternatives

- Trier uniquement par temps mural : rejeté, une conséquence peut précéder sa cause.
- Accepter tout retry avec le même opId : rejeté, masque des mutations incompatibles.
- Réutiliser les dots spéculatifs : rejeté, provoque des collisions avec le principal.
- Clôturer après une réponse worker : rejeté, ne vérifie pas l'état engagé.
- Augmenter la baseline qualité ou affaiblir les tests globaux : rejeté.
