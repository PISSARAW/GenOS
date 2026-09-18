# Matrice de cohérence code et documentation

- **Statut** : Implémenté comme registre de suivi documentaire
- **Portée** : contrats opérationnels ajoutés ou clarifiés en septembre 2026.
- **Dernière revue** : 2026-09-18

## 1. Registre

| Domaine | Source principale | Documentation | API/exemple | Test/protocole | Maturité |
| --- | --- | --- | --- | --- | --- |
| Product Proofs | `productProofController.js` | [preuves produit](../03-reference/preuves-produit-et-safe-debugging.md) | Oui | [contrats récents](tests-des-contrats-recents.md) | Implémenté |
| OIDC/SAML | `ssoRoutes.js` | [fédération](../05-securite-gouvernance/sso-oidc-saml.md) | Oui | Rejeu et signatures | Implémenté |
| Dossiers/conscience | `agentDossierService.js` | [dossiers](../02-orchestration/dossiers-agents-et-conscience.md) | Oui | Barrière d’evidence | Implémenté |
| Contrats stratégie | `strategyContractService.js` | [contrats](../02-orchestration/contrats-strategie-et-execution.md) | Oui | Runs et approbations | Implémenté |
| Notifications | `evaluationController.js` | [notifications](../03-reference/notifications-et-alertes.md) | Oui | Isolation tenant | Implémenté |
| Releases | `releaseController.js` | [rollouts](../04-exploitation/releases-et-rollouts.md) | Oui | Canary et rollback | Implémenté |
| Bridge Rust | `rustBridgeController.js` | [bridge](../03-reference/pont-rust-et-hallucinations.md) | Oui | Diff et replay | Implémenté |
| Platform approvals | `platformController.js` | [approbations](../05-securite-gouvernance/approbations-platform.md) | Oui | Permission/lease/scope | Implémenté |

## 2. Règle de cohérence

Une ligne ne peut être déclarée « Implémenté » que si le code, le contrat exposé, un
exemple et un test ou protocole de validation sont tous présents :

\[
Maturity_{implemented}=Code\land Contract\land Example\land Evidence
\]

La présence d’un fichier ou d’une route seule ne suffit pas.

## 3. Processus de mise à jour

Lorsqu’une route, une migration ou un contrat change :

1. identifier la ligne concernée dans cette matrice ;
2. mettre à jour la référence technique et l’index de famille ;
3. ajouter ou modifier un exemple ;
4. ajouter un scénario nominal et un scénario de refus ;
5. mettre à jour la date de revue ;
6. exécuter `git diff --check` et le contrôle de qualité du dépôt ;
7. committer code et documentation avec une description cohérente.

## 4. Limites

Cette matrice est un registre humain, pas une détection automatique complète. Les
chemins de code et les routes doivent être revérifiés lors d’un changement de module.
Une métaphore scientifique ou biologique ne doit jamais être comptée comme une preuve
fonctionnelle.
