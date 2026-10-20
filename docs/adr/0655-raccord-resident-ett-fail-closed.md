# ADR 0655 — Raccorder ETT au scheduler résident en échec fermé

- **Statut** : Accepté pour le raccord ; activation de production indisponible
- **Date** : 2026-10-20
- **Domaine** : pensée endogène, scheduler résident, autorité, vérification, coûts
- **Lié à** : ADR 0626, ADR 0627, ADR 0646, ADR 0647

## Contexte

`runAutonomousLoop()` sait reprendre un épisode ETT et reconstruire sa consommation
depuis les reçus de runs persistés. Il refuse toutefois de fonctionner sans callbacks
d'autorisation et de vérification indépendante. Une exécution par worker exige aussi
un sandbox `isolated-read-only`, un mécanisme de récupération et un mesureur d'usage
externe.

Le backend de production possède un scheduler résident dans `idleTickService`, mais
aucun fournisseur de signature SHEV ETT, aucun vérificateur ETT indépendant et aucun
sélecteur atomique d'épisode prêt pour ce chemin. Les clés créées par l'exécuteur de
campagne sont synthétiques et temporaires ; les réutiliser en production confondrait
preuve de développement, autorité et vérification.

## Décision

Le scheduler résident appelle un raccord ETT à chaque balayage. Le raccord reste
explicitement `unavailable` par défaut. Il ne transmet un épisode à
`runAutonomousLoop()` que si son appelant injecte simultanément :

- un sélecteur de candidat ;
- un signataire d'autorisations SHEV ;
- un fournisseur de vérification indépendante ;
- un worker ou solveur ;
- un sandbox conforme et capable de récupérer une réservation ambiguë ;
- un mesureur d'usage externe.

Le raccord traite au plus un candidat par cycle du scheduler. Les dépendances de
confiance sont prises dans sa configuration, pas dans le candidat. La borne
`maxCycles` reste comprise entre un et dix. Le calcul de consommation reste celui de
la boucle ETT : elle relit et valide les reçus de runs persistés avant de poursuivre.

L'entrée serveur actuelle démarre le scheduler sans ces dépendances. L'état du
scheduler expose donc `endogenousThought.status = unavailable` et `reason = disabled`.
Aucun simple drapeau d'environnement ne peut contourner les portes manquantes.

## Conséquences

Le chemin résident vers la boucle est testable sans inventer une route HTTP ou une
autorité implicite. Une future intégration peut fournir les dépendances explicites
sans modifier la boucle ETT ni affaiblir ses contrôles.

Ce raccord ne constitue pas une activation de production. Il ne fournit ni stockage
durable des échecs du scheduler, ni gestionnaire de clés, ni service de vérification,
ni politique de sélection concurrente des épisodes. Ces éléments restent des
prérequis bloquants. Une erreur après activation est visible dans le dernier résultat
du scheduler avec le statut `failed`, mais n'est pas promue comme succès.

## Alternatives

- Générer des clés au démarrage comme dans la campagne : rejeté, car l'autorité et le
  vérificateur seraient co-localisés et éphémères.
- Activer la simulation déterministe sans worker : rejeté pour le chemin résident de
  production, car elle ne mesure aucun coût réel et ne constitue pas un solveur isolé.
- Exposer une nouvelle route HTTP : rejeté, car aucun contrat d'autorisation opérateur
  n'existe pour cette activation et la demande porte sur le scheduler résident.
- Ne rien raccorder : rejeté, car l'indisponibilité resterait implicite et non testée.

## Vérification

- `node backend/tests/test_endogenous_thought_resident_scheduler.js`
- `node backend/tests/test_endogenous_thought_cycles.js`
- `python scripts/ci/check_code_quality.py --strict`
