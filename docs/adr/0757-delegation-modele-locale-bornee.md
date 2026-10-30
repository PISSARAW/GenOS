# ADR 0757 — Délégation locale par plan modèle borné

Le runtime local des `sub_orchestrator` produisait auparavant une réponse JSON unique ; le modèle ne pouvait pas créer les enfants dont il décrivait les résultats. Le chemin natif `coordinate_children` reste distinct.

Un sous-orchestrateur possédant un contrat actif de délégation produit désormais un plan structuré Qwen. Le runtime valide types de workers, nombre d'enfants, dépendances antérieures et plafond cumulé de tokens, puis appelle le dispatcher réel. Les enfants gardent l'identité du sous-orchestrateur comme parent immédiat. Ils héritent de la route modèle et consomment le même scope budgétaire racine, après vérification de la chaîne et du ledger de délégation. Une autre mission ou un frère ne peut pas utiliser ce scope.

Un enfant `code` exige un bail d'écriture déjà fourni par l'opérateur et reste confiné aux chemins et commandes permis. Un enfant `review` doit être un `verifier_worker` dépendant d'un enfant code antérieur. Seuls les fichiers autorisés, dont les hashes concordent avec son reçu de tests terminé, sont matérialisés dans une capsule de revue distincte. Le ledger lie source, candidat, mission et reviewer. Le reviewer exécute ses propres tests sans patch via le chemin test-only. Aucune copie dans le workspace parent ni promotion globale n'est effectuée.

La synthèse Qwen reçoit les identités et reçus persistés. Les résumés de succès sont contrôlés contre les enfants réellement exécutés. La fin d'exécution d'un enfant ne suffit pas à déclarer sa correction sémantique : le champ de vérification du reçu reste explicite. Les délais, leases et budgets restent imposés par le runtime. `delegationLimit: 0` conserve un contrat sans autorité de spawn et sans enfant.

Validation : `test_local_model_delegation.cjs` utilise une vraie base et un fournisseur simulé pour vérifier les enfants et réservations ; `test_local_model_delegated_review.cjs` exécute réellement `pytest` dans deux capsules distinctes et vérifie reçus séparés, source immuable et refus des snapshots étrangers ou modifiés après test. Ces tests ne constituent pas une mesure du modèle Qwen réel ; la campagne doit vérifier ses plans et résultats.

Une dépendance `dependsOn` en mode analyse ou code projette le rapport du receipt producteur dans le prompt enfant. La projection vérifie les deux workers frères, leur mission, tenant et run producteur, puis relit le receipt scellé et son hash. Elle est bornée à 24 Ko et conserve explicitement `verified: false` si le résultat ne possède pas de preuve sémantique. Cette transmission est une donnée, pas une instruction d'autorité ni une promotion. Elle ne copie aucun fichier ; seule la revue de code utilise le snapshot testé prévu à cet effet. Une référence manquante, hors scope ou falsifiée est refusée.

Le runtime revalide l’autorité de mission après le dernier enfant et juste avant la synthèse modèle. Une révocation pendant ce dernier enfant interdit ainsi tout nouvel appel fournisseur de synthèse. `test_local_delegation_synthesis_authority.cjs` vérifie le chemin valide et cette révocation, avec un seul appel de planification consommé en cas de refus.

Une reprise du même sous-orchestrateur crée un nouveau run. Le dispatcher transmet
désormais explicitement le run parent scellé à l'autorisation de délégation et au
binding signé de chaque enfant (`parentRunId`). Le bootstrap de l'enfant et son
budget partagé retrouvent ce run depuis le binding, sans choisir le dernier run
de l'agent. La mission provient de l'enveloppe du run, et le run parent doit être
encore `planned` ou `running`. Un run étranger, terminal ou révoqué reste refusé.
Le nombre d'enfants et les allocations restent cumulés sur le contrat du worker,
y compris entre reprises ; un nouveau run ne réinitialise pas ces plafonds.

Les bindings v1 historiques sans `parentRunId` ne restent utilisables que si le
parent possède exactement un run, encore autorisé. Dès que plusieurs runs rendent
la liaison ambiguë, `DELEGATION_PARENT_RUN_UNBOUND` demande un raccordement explicite ;
aucun rattrapage par « dernier run » n'est effectué. L'appel de délégation sans run
explicite continue à produire `EXECUTION_AUTHORITY_RUN_REQUIRED` en cas d'ambiguïté.

La sonde `test_cli_local_delegation_recovery.cjs` lance le vrai CLI avec la requête
du mini-projet CSV et un provider simulé. Une première synthèse volontairement
rejetée déclenche la récupération réelle du même worker. La sonde de perte de
contexte reproduit le refus, puis le chemin corrigé crée des enfants et une revue
`pytest` dans des runs distincts liés au nouveau parent. Ce test n'est pas une
mesure Qwen. `test_bounded_delegation_parent_run.cjs` vérifie aussi la compatibilité
v1 à run unique et le refus des bindings ambigus, runs clos et missions révoquées.
