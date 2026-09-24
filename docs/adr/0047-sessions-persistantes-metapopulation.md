# ADR 0047 — Sessions persistantes de Métapopulation

## Statut

Accepté.

## Date

2026-09-24.

## Domaine

Orchestration, Métapopulation, persistance, lignées et provenance.

## Décideurs

Équipe GenOS.

## Lié à

[Métapopulation](../02-orchestration/topologies/metapopulation.md), [contrat produit](../03-reference/contrat-produit-et-completude.md).

## Contexte

La façade de coordination expose déjà composition, quorum pondéré, plan de
régénération et pondération de connexions. Le modèle cible demande des sessions
reconstructibles comprenant patches, dèmes, corridors, migrations et historique
régional. L'état ne doit pas être enfermé dans un unique document JSON mutable.

## Décision

1. Garder metapopulationCoordinationService.js comme façade publique et y
   ajouter la création, le rechargement et la journalisation d'événements de
   session.
2. Définir des contrats validés pour la session, patch, dème, propagule,
   corridor dirigé et événement régional avant d'ajouter leur cycle de vie.
3. Créer des tables dédiées pour sessions, patches, dèmes, corridors,
   migrations, extinctions et colonisations. Les attributs structurés extensibles
   peuvent rester en JSON validé ; identifiants, relations, états et mesures
   principales restent en colonnes.
4. Inscrire les événements régionaux dans un journal append-only avec séquence,
   révision, provenance, acteur et heure. La création de session et son premier
   événement sont atomiques.
5. Réutiliser le moteur multi-îlots Rust, le service procédural et les
   mécanismes existants d'AgentDNA, cryptobiose, snapshots et fossilisation.
   Cette évolution ne crée pas de moteur évolutionnaire parallèle.
6. Donner à chaque dème une capsule créée par le cycle de vie workspace existant.
   La frontière locale est vérifiée par l'API d'écriture GenOS ; une violation
   journalisée met le dème en quarantaine. Les budgets locaux sont plafonnés
   et consommés dans une transaction.
7. Conserver chaque heartbeat du dème en historique append-only. La vue
   régionale classe le silence à partir de sa fraîcheur, de la dernière preuve
   et des signaux runtime fournis ; l'absence de heartbeat reste inconnue.
8. Représenter chaque corridor comme une arête dirigée. Les politiques de
   topologie régénèrent les arêtes actives dans une transaction ; une arête
   retirée est désactivée et conserve ses compteurs et son historique de
   bénéfices pour l'analyse ultérieure.
9. Placer les migrations offertes en quarantaine jusqu'à la validation du
   dème receveur par un adaptateur enregistré selon le type. Une assimilation
   n'est acceptée qu'avec un reçu de provenance ; l'adaptateur reçoit l'identité
   de migration comme clé d'idempotence.

## Conséquences

### Positives

- Une session peut être rechargée après redémarrage sans reconstruire son état
  à partir d'un JSON monolithique.
- Les événements régionaux disposent d'un ordre et d'une provenance auditables.
- Les capsules réutilisent le provisionnement workspace existant, et les
  heartbeats permettent une vue régionale sans écraser l'historique.

### Négatives

- Une session persistée nécessite une base initialisée avec les migrations
  Métapopulation correspondantes.
- Le garde de frontière protège les écritures transitant par la façade ; il
  n'intercepte pas un accès direct au système de fichiers hors du runtime GenOS.
- La voie sans base de données reste volatile et ne promet pas la reprise après
  redémarrage.

## Alternatives

- Réutiliser topology_sessions avec tout l'état empaqueté dans state_json :
  rejeté, car les patches, dèmes et événements seraient difficilement
  requêtables et versionnables indépendamment.
- Remplacer ou dupliquer le moteur évolutionnaire Rust : rejeté, car la cible
  réutilise les dynamiques multi-îlots existantes.
