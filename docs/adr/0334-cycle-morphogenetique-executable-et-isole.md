# ADR 0334 — Cycle morphogénétique exécutable et isolé

- Statut : Accepté
- Date : 2026-10-06
- Domaine : Morphogenèse, runtime, transitions et preuves

## Contexte

Le runtime V2 acceptait une décision noyau valide sans vérifier APPLY. Les états
imbriqués des branches partageaient des références. La boucle structurelle ne
transmettait ni rollback ni migration et ignorait le nouveau graphe engagé.
Plusieurs mutations conservaient des références obsolètes ou réussissaient sans
modifier une cible absente. Trois kinds de feuilles ne possédaient aucun exécuteur.

## Décision

Le commit V2 exige APPLY, l'autorisation de gouvernance et un commit confirmé.
Une erreur d'apprentissage après commit est rapportée sans nier le commit effectué.
Un contrefactuel requis doit retourner accepted=true. Les adapters kernel,
governance et transition sont fournis explicitement par l'application ; une réponse
de transport ne remplace aucune de leurs preuves.

Le runtime contrôle structure, arité et budgets avant exécution. Les états des
branches sont clonés en profondeur ; les modifications de l'état retourné sont
propagées. Un nœud gelé, quiescent ou terminé ne s'exécute pas. Les dossiers de
preuve sont collectés séparément des reçus d'exécution. L'apprentissage exige un
reçu signé accepté par le registre des vérificateurs.

ADAPTER, ENVIRONMENT et DIRECT_WORKER possèdent un exécuteur commun à contrat
explicite. Un provider execute enregistré doit retourner une enveloppe output,
avec éventuellement state et evidence. Un provider absent est refusé.

Les opérations de patch sont atomiques sur un clone. Les déplacements maintiennent
parent, children et CONTAINS ; les fusions de frères remappent les liens et préservent
workers, état et budget. Les conflits d'état exigent une résolution explicite.
SPLIT conserve l'identité du nœud comme coordinateur PARALLEL et y attache les
nouveaux enfants et répartit les workers conservés entre eux. Les budgets imbriqués
sont additionnés lors d'une fusion. La croissance exige des descriptors de workers explicites.

MorphologyRuntime exige un adaptateur de contrefactuel isolé avant une transition.
Le committer injectable confirme son commit avec committed=true et reçoit la
version attendue. Un PatchExecutor sans committer retourne un graphe transformé
en mémoire ; il n'annonce aucune persistance SQLite. L'appelant adopte ce graphe
seulement après vérification. Les erreurs de restauration restent visibles.

Les ticks sont sérialisés et les boucles sont déclenchées par leur échéance.
La boucle structurelle adopte le graphe réussi et conserve les propositions refusées.

Le runtime historique accepte configureRuntimeServices ou options.runtimeServices
pour déléguer au pipeline V2. Sans configuration complète il conserve une proposition.
L'option de construction emit permet d'injecter la télémétrie. Son échec après
commit est signalé sans nier une transition confirmée.
Le planner accepte un budget numérique ou un objet tokens et refuse les valeurs
non finies en les ramenant à zéro.

## Validation

Exécuter npm --prefix backend run test:morphogenesis. Les tests de completion
couvrent les refus noyau, l'isolation, les versions périmées, les mutations
structurelles, les commits et les restaurations en erreur. Les gates globaux
restent python scripts/ci/check_code_quality.py, npm test et cargo test --workspace.
Le catalogue et les autres changements du dépôt ne sont pas certifiés par ces seuls
tests ciblés.
