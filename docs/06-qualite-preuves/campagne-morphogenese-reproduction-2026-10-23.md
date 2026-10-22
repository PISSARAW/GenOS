# Campagne morphogenèse et naissance — 2026-10-23

## Portée

Cette campagne suit le cycle Morphogenèse documenté : observer les reçus, diagnostiquer les écarts, proposer une mutation minimale typée, la soumettre aux garde-fous, exécuter, puis vérifier les effets. Elle sépare la qualification de contrats, la reproduction cellulaire logicielle, les handlers de simulation et la naissance d'un worker cognitif.

Environnement : Windows x64, Node v24.18.0, worktree `D:\GenOS\identity-real-llm-worktree`, branche `codex/identity-real-llm`. Les sorties complètes et codes de retour ont été conservés sous `D:\GenOS\reproduction-campaign-20261022\`.

## Qualification des huit topologies et des frontières

Commande complète, sans filtre :

```powershell
node backend/tests/run_topology_contracts.cjs
```

Le premier passage a produit `failed` : 7/8 groupes et 5/5 frontières réussis. Trinity s'arrêtait sur `test_trinity_runtime_delivery.js:24`, qui attendait une exception de `writeArtifacts`. Le contrat public de cette fonction renvoie pourtant `{ written, rejected }`; la traversée de chemin est refusée dans `rejected`, sans fichier externe.

La correction minimale du test vérifie le rejet structuré et l'absence du fichier avant et après l'appel. Le test isolé passe, puis le passage complet donne **8/8 groupes, 5/5 frontières, zéro échec**, en 363 846 ms. Le bundle déclare `verdict: qualified` et constate un worktree modifié au commit de base `24fc75448836ebc961d1509948095b5a4a1b93e1`.

Bundle généré (ignoré par Git selon la règle `artifacts/`) :
`D:\GenOS\identity-real-llm-worktree\artifacts\qualification\topology-contracts\topology-contracts-2026-10-22T22-19-45-222Z-25344.json`.

Ce verdict qualifie les contrats testés sous Windows. Le harness précise qu'il ne démontre ni fournisseur live, ni déploiement de production, ni supériorité universelle des topologies.

## Expériences de reproduction

Les quatre cibles Rust proposées dans le texte de campagne ont toutes réussi :

| Commande | Résultat | Ce que cela vérifie |
| --- | --- | --- |
| `cargo test -p genos-orchestrator --test reproduction_cycle -- --nocapture` | 9/9 | Reproduction cellulaire autonome sur plusieurs générations, budgets, conditions d'arrêt et mutation tracée. |
| `cargo test -p genos-orchestrator --test reproduction_lineage_replay -- --nocapture` | 3/3 | Rejeu de lignée après réouverture, et rollback d'une naissance si l'ajout du reçu échoue. |
| `cargo test -p genos-orchestrator --test reproduction_campaign_seed -- --nocapture` | 2/2 | Reprise déterministe, idempotence et rejet avant mutation d'état. |
| `cargo test -p genos-cli --test biological_ecology_reproduction_campaign -- --nocapture` | 1/1 | Même lignée après redémarrages CLI avec même état et même graine. |
| `node backend/tests/test_breed_transaction.js` | PASS | Insert enfant et lignée atomiques; rollback sans orphelin. |
| `node backend/tests/test_chimeric_merge.js` | PASS après correction du fixture | Lignée et métadonnées de chimère; `runtime_agent_created: false`, `execution_scope: metadata_simulation`. |
| `node backend/tests/test_all_birth_mechanisms_mcp_dispatch.js` | PASS après correction du fixture | Enregistrement et dispatch `status` des 19 outils; le test dit explicitement qu'il ne teste pas une naissance runtime. |

Les deux derniers tests échouaient initialement parce que le middleware MCP refuse par défaut tout appel sans lease explicite. Les fixtures donnent maintenant, uniquement dans leur processus, une lease minimale (un outil pour la chimère, les 19 outils pour la sonde de dispatch), valable 60 secondes, puis restaurent l'environnement précédent dans `finally`. Aucune autorisation de production n'est élargie.

Les sorties initiales et finales sont sous `D:\GenOS\reproduction-campaign-20261022\birth-tests\` et les logs détaillés des campagnes précédentes sont sous `D:\GenOS\reproduction-campaign-20261022\D-*.log`.

## Essai Qwen déjà présent sur D:

`D-S07-Qwen-seed-7-final.log` rapporte `status: pass` pour `ollama://qwen2.5:14b`, graine 7, vérification exacte de trois types de relations et de leur direction. C'est une exécution réelle de Qwen sur un scénario de graphe social; elle ne constitue pas une exécution Qwen d'un descendant ni une preuve de reproduction cognitive.

## Verdict gradué

- **Démontré ici :** contrats des huit topologies et cinq frontières sur Windows; naissance et persistance de cellules logicielles dans le runtime Rust; répétabilité déterministe; transaction enfant/lignée du backend; dispatch des outils sous lease de test.
- **Démontré comme simulation seulement :** fusion chimérique du backend. Le résultat conserve des métadonnées et des relations, mais ne crée aucun agent runtime.
- **Pas encore démontré :** triplets de workers Qwen exécutables, enfants cognitifs indépendants, héritage de capacités effectivement mesuré, chimère fonctionnelle, naissance de workers après redémarrage et amélioration intergénérationnelle.

## Expérience morphogénétique suivante pour une naissance cognitive

Garder cette expérience en mode shadow jusqu'à ce que tous les contrats d'entrée et de preuve soient satisfaits :

1. Geler les identités, génomes, versions et reçus de deux parents; vérifier qu'ils peuvent chacun réussir une mission de référence et enregistrer leurs budgets.
2. Recombiner une paire de traits autorisés en un candidat enfant; vérifier le diff génomique, les deux provenances, la compatibilité et l'absence de secrets ou de privilèges hérités.
3. Créer identité, génome enfant, relations parentales, réservation de ressources et reçu de naissance dans une transaction récupérable. Un échec à n'importe quelle étape doit laisser zéro enfant actif et zéro lignée orpheline.
4. Démarrer trois enfants dans des workspaces séparés avec le runtime Qwen déclaré explicitement; leur donner trois missions distinctes, bornées et vérifiables par un oracle indépendant du modèle.
5. Vérifier chaque sortie, coût et identité, redémarrer le runtime, rejouer les reçus et prouver qu'aucune naissance n'est dupliquée et que les états des enfants divergent seulement après leurs expériences distinctes.
6. Comparer chaque enfant aux parents et à une équipe parentale A+B, à budget égal. Autoriser une transition active ou une nouvelle génération uniquement après preuves reproductibles et gouvernance; sinon choisir `NO_CHANGE`.

Ce graphe sépare les préconditions, l'exécution et la preuve d'effet. Une composition de graphe, un reçu d'exécution ou un statut `success` seul ne franchit pas la barrière de naissance fonctionnelle.
