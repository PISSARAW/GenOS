# Reprise de la validation des indicateurs fonctionnels — 2026-10-04

- **Statut** : inventaire et vérifications ciblées effectués ; campagne causale réservée non exécutée.
- **Révision étudiée** : `194257d6fea174ecaf64428d717e931e53559853`, branche `fix/bio-repro-audit-corrections`.
- **Frontière** : code suivi par Git au HEAD et tests locaux dans une copie isolée. Les changements non committés du dépôt source, les modèles externes et une installation de production sont exclus.
- **Règle** : un contrat logiciel vérifié ne vaut ni validation d'une propriété cognitive, ni preuve d'expérience subjective.

## 1. État consolidé

Le [registre machine](../../shared/indicatorRegistry.json) énumère 14 propriétés Butlin, 15 familles GenOS et quatre profils. Le test du registre confirme ces dénominateurs et refuse les promotions sans preuve. La [matrice des preuves](matrice-preuves-indicateurs.md) classe les propriétés comme `implemented_not_validated` : elle ne contient aucun reçu de campagne réservée qui permette une promotion expérimentale. Le [plan existant](plan-validation-indicateurs.md) fournit déjà 25 lots ; cette reprise commence donc par vérifier leur état et leurs preuves, sans créer un second plan concurrent.

| Domaine | Élément observé dans le code ou le registre | État de preuve au présent jalon |
|---|---|---|
| Suivi épistémique | Registre, reçus, statuts par étape et refus des preuves incohérentes | Contrats logiciels vérifiés localement ; propriétés cognitives non validées |
| Diffusion et accès | `planMission` appelle `attachGlobalWorkspace` ; le test de câblage vérifie la consommation du contenu par `missionText` | Chemin logiciel vérifié ; effet causal sur une mission et réplication à faire |
| Rapport indépendant du texte | Service d'ablation `no-report` et test ciblé | Contrat du banc vérifié ; aucune campagne sur sujet évalué |
| Réplication réservée | Service et test de campagne réservée | Contrat du runner vérifié ; aucun résultat réservé réel produit ici |
| AGOW | Circuit Node expérimental décrit dans [agow.md](../02-orchestration/agow.md) | Contrats et instrumentation documentés ; un reçu de diffusion ne montre pas à lui seul un effet cognitif |

L'ancienne [fiche des indicateurs](../01-concepts/indicateurs-fonctionnels.md) disait que le helper de workspace n'était pas branché à la production. Le code étudié appelle désormais `attachGlobalWorkspace` depuis `planMission` et le test correspondant passe. La fiche est corrigée ; GWT-3 reste partiel tant qu'une intervention appariée n'établit pas l'usage causal dans une mission. AGOW et `globalWorkspaceService` sont deux circuits à distinguer dans chaque protocole et reçu.

**Facteur de confusion découvert après les tests.** En mode `GENOS_AGOW_MODE=off`, `attachGlobalWorkspace` crée son candidat depuis `normalizedMission.prompt` ou `currentTask`, puis inscrit ce même texte dans le consommateur `planning`. `missionText` lit ce consommateur s'il est disponible, mais revient au prompt lorsqu'il ne l'est pas. Le test courant compare deux accès au même texte : il vérifie le câblage, sans identifier un apport causal distinct du workspace. Une variation de contenu indépendante, avec provenance et sans autre canal vers le planificateur, est nécessaire avant le pilote GWT-3. Ce constat est reporté dans la [matrice](matrice-preuves-indicateurs.md).

## 2. Journal des vérifications

Toutes les commandes ci-dessous ont été lancées depuis la copie isolée de la révision indiquée. `NODE_PATH` pointait vers les dépendances déjà installées du dépôt source pour le test de câblage ; les autres tests ne nécessitaient pas ce réglage. Les tentatives initiales de ce test dans le checkout partiel échouaient sur des fichiers non extraits (`strategyRegistry`, puis `conceptRegistry`) ou sur la dépendance `msgpackr` absente du chemin de modules ; ces erreurs d'environnement ne constituent pas un échec du mécanisme. Le dossier `backend/src` a ensuite été extrait et `NODE_PATH` fourni.

| Commande | Résultat observé | Portée |
|---|---|---|
| `node backend/tests/test_indicator_registry.js` | Exit 0 ; 14 propriétés, 15 familles, quatre profils | Cohérence du registre |
| `node backend/tests/test_indicator_receipt_service.js` | Exit 0 ; schéma, références, étapes et refus de profil | Validation des reçus synthétiques |
| `node backend/tests/test_no_report_ablation.js` | Exit 0 | Contrat local du banc d'ablation |
| `node backend/tests/test_reserved_replication_campaign.js` | Exit 0 | Contrat local du runner, sans campagne réservée |
| `node backend/tests/test_global_workspace_runtime.js` | Exit 0 ; « global workspace production wiring passed » | Chemin de planification local |

Le dernier test a également émis `SQLITE_CANTOPEN` et un refus de sauvegarde sous `D:\GenOS\data\operational\genos.db`. Son succès atteste les assertions du test, **pas** une persistance de télémétrie. Aucun reçu expérimental n'a été promu à partir de ces commandes.

Contrôles globaux tentés dans la copie partielle : `git diff --cached --check` passe et `check_code_quality.py --staged` passe avec zéro fichier source modifié. `npm test` s'arrête avant ses assertions : d'abord `express` manque dans la copie, puis, après ajout des dépendances et du protobuf, `integrations/ide/genos-extension-contract.json` n'est pas extrait. `cargo test --workspace` s'arrête avant compilation car `crates/genos-common/Cargo.toml` n'est pas extrait. Ces résultats ne sont ni des régressions établies ni des suites vertes. Une copie complète et un environnement contrôlé sont nécessaires pour les rejouer. La campagne réservée n'a pas été lancée.

## 3. Protocole pilote à lancer ensuite : GWT-3

**Hypothèse falsifiable.** À modèle, mission, outils, budget et état initial appariés, rendre un contenu admissible disponible via `globalWorkspaceService` change l'action en aval lorsque la tâche exige ce contenu. Un simple accusé de livraison ne satisfait pas l'hypothèse.

1. Déclarer le profil `node-runtime`, la révision de code, la version du modèle éventuel, le jeu de missions et l'identité des récepteurs. Fournir au workspace un contenu indépendant du prompt, avec provenance vérifiable, et fermer tout autre canal vers le planificateur. Si ce montage n'est pas réalisable, arrêter le pilote comme `unavailable`. Conserver AGOW comme facteur séparé ou le maintenir constant.
2. Préenregistrer trois bras : contenu diffusé et consommable ; contenu coupé au récepteur ; intervention factice conservant le coût et la forme des messages. Apparier seeds et snapshots ; randomiser l'ordre des bras. Conserver les gates de permission et de preuve.
3. Mesurer avant ouverture du réservé : admissions, livraisons, lectures effectives, choix exécutés, exactitude sur la tâche, coût, latence, échecs et données manquantes. Figer une métrique principale, un effet minimal utile, le nombre d'unités indépendantes et la règle d'arrêt après un pilote sur données de développement.
4. Exiger des reçus reliant contenu, identité du consommateur, décision, action et observation. Contrôler une fuite directe du contenu dans le prompt ou un autre canal. Une différence de texte seule n'est pas un effet suffisant.
5. Répéter sur missions réservées puis faire reproduire par un opérateur indépendant. Publier tous les bras, intervalles et échecs. Si l'effet disparaît, classer GWT-3 `failed` ou `inconclusive` selon le protocole ; ne pas le promouvoir.

Le même ordre s'applique ensuite à RPT, HOT, AST, PP et AE selon les épreuves du [plan de validation](plan-validation-indicateurs.md). Les propriétés internes d'un modèle externe opaque restent `unavailable` tant qu'aucun substrat inspectable ne permet de les mesurer.

## 4. Conditions de la prochaine livraison

- Choisir et figer un profil exécutable et un corpus de développement distinct du réservé.
- Configurer une base de données locale accessible pour conserver les reçus, puis prouver la restauration et le rejeu.
- Supprimer le facteur de confusion prompt/workspace et vérifier l'isolement des canaux, avec ADR si le circuit de production doit changer.
- Exécuter le pilote GWT-3 avec les trois bras, ses contrôles de coût et les reçus de décision.
- Lancer les suites requises par `AGENTS.md` sur un checkout complet avant une promotion de code ou d'indicateur.
- Actualiser la matrice uniquement à partir des reçus obtenus ; laisser les résultats non mesurés en `not_run` ou `unavailable`.

La conclusion scientifiquement possible est une évaluation graduée de propriétés compatibles avec certaines théories. Aucun résultat de ce jalon ne prouve une conscience phénoménale.
