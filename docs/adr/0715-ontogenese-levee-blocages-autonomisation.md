# ADR 0715 — Ontogenèse : levée des blocages et autonomisation partielle

- **Statut** : Proposé
- **Date** : 2026-10-21
- **Domaine** : Ontogenèse, orchestration, exécution, Git, sécurité
- **Décision-id** : 0715

## Contexte

L'analyse de l'ontogenèse (`docs/01-concepts/ontogenese.md`, `backend/src/services/ontogenesis/`) révèle 14 points qui empêchent l'ontogenèse de fonctionner seule — c'est-à-dire de créer et modifier des fichiers sans intervention opérateur. Certains de ces points sont des **garde-fous délibérés (by design)** issus d'ADR antérieurs (notamment 0235) ; d'autres sont purement **configurables** et peuvent être levés sans modifier l'architecture de sécurité.

Le principe fondateur de GenOS s'applique : un transport réussi n'est pas une preuve de décision valide. Toute autonomisation de l'ontogenèse doit respecter les gates de preuves, les budgets décroissants, l'exclusion mutuelle (claim) et l'interdiction de push/merge implicite.

## État des 14 points identifiés

| # | Point | Statut | Décision | Raison |
|---|-------|--------|----------|--------|
| 1 | Contrôleur pur — pas d'E/S directe | By design | **Maintenu** | Séparation observateur/contrôleur (ADR 0235 §2) |
| 2 | Dépendance à un runtime LLM externe | Déploiement | **Confirmé** | Nécessite un fournisseur LLM accessible (Ollama/Codex) |
| 3 | `git_authority.localCommit = false` | By design | **Maintenu** | Le worker ne commite pas ; l'intégrateur Git unique le fait |
| 4 | `allowPush` / `allowMerge` interdits | By design | **Maintenu** | Hors autorité de l'ontogenèse (configSchema, ADR 0235 §8) |
| 5 | `allow_file_edits` conditionné à `allowEdit` | Configurable | **Confirmé** | Déjà `true` par défaut dans `defaultConfig()` |
| 6 | Dispatch exige des `checks` configurés | Configurable | **Confirmé** | Déjà configurés par défaut (`npm test`) |
| 7 | `PAUSED` ne se réveille jamais seul | By design | **Maintenu** | Pause manuelle persistante (stateMachine.js) |
| 8 | Local s'arrête avec la machine | By design | **Maintenu** | Pas de bascule à chaud (ADR 0235 §10) |
| 9 | Pas de suspension fiable → reprise à l'identique | By design | **Maintenu** | `continuation_queue` est une brique de transport |
| 10 | Pas de fournisseur externe attesté | Déploiement | **Confirmé** | Les tests utilisent `fakeHarness`, pas un vrai LLM |
| 11 | Pas de push/fusion | By design | **Maintenu** | `authorizationService.js` refuse push et merge |
| 12 | Aucune topologie branchée de bout en bout | By design | **Maintenu** | Le contrat existe, l'implémentation complète vient après |
| 13 | Claim peut expirer et être volé | By design | **Maintenu** | Exclusion mutuelle avec TTL et heartbeat |
| 14 | Pas de création de fichiers directe par le contrôleur | By design | **Maintenu** | Le contrôleur décide, le worker exécute, l'intégrateur écrit |

## Décision

**L'ontogenèse reste un contrôleur qui délègue l'exécution.** Les points 1, 3, 4, 7, 8, 9, 11, 12, 13, 14 sont des garde-fous architecturaux délibérés et ne seront pas levés. Les points 2, 5, 6, 10 relèvent de la configuration et du déploiement : ils sont déjà couverts par les valeurs par défaut du code, mais nécessitent un environnement d'exécution (LLM, base SQLite, dépôt Git) pour fonctionner de bout en bout.

**Aucun fichier de code n'est modifié par cette décision.** Elle confirme l'état actuel et documente les conditions nécessaires à un fonctionnement autonome :

- Un runtime LLM accessible (Ollama configuré dans `.env`) ;
- Une base SQLite WAL accessible (`GENOS_DB_PATH`) ;
- Un dépôt Git avec une branche `codex/ontogenesis` ;
- Des `checks` configurés dans la config du projet (déjà présents par défaut) ;
- `authority.allowEdit = true` (déjà présent par défaut).

Si une évolution future souhaite lever un garde-fou by design (par exemple autoriser le worker à committer directement, ou permettre l'auto-réveil en `PAUSED`), elle fera l'objet d'un ADR distinct qui amende explicitement 0235 et/ou 0609.

## Conséquences

- L'ontogenèse ne crée pas de fichier elle-même : c'est le worker (via le runtime LLM) qui produit les fichiers dans le worktree candidat, puis l'intégrateur Git qui les copie et les commite.
- Pas de push ni de merge : la livraison s'arrête au commit local vérifié sur `codex/ontogenesis`.
- Une pause manuelle (`PAUSED`) survit au redémarrage et n'est jamais réactivée automatiquement.
- Pas de reprise à chaud après arrêt du processus local ; reprise depuis l'état persisté réconcilié.

## Voir aussi

- [ADR 0235 — Ontogenèse : orchestrateur résident de projet](../0235-ontogenese-orchestrateur-resident-projet.md)
- [ADR 0609 — Bascule vers un hôte toujours disponible](../0609-bascule-ontogenese-hote-toujours-disponible.md)
- [ADR 0608 — Confiner l'Ontogenèse avec les Job Objects Windows](../0608-confiner-ontogenese-job-objects-windows.md)
- [Contrats stables de l'Ontogenèse](../03-reference/ontogenese-contrats.md)
