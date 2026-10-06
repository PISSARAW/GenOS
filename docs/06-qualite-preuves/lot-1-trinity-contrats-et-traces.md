# Lot 1 Trinity — Contrats, registre et traces

- **Statut** : infrastructure implémentée ; qualification des variants en attente des lots suivants.
- **Dernière revue** : 2026-10-06.
- **Base de travail** : `474b345473f7add78539c8f2f82492500561bf7f`, branche `v3`, avec changements concurrents préexistants.
- **Décision** : [ADR 0341](../adr/0341-trinity-contrats-et-traces-de-qualification.md).

## Résultat et portée

L1 rend opposables les entrées et les traces des prochaines exécutions. Il reconstruit
le registre de la campagne historique sans transformer une réussite de fixture en
réussite de mission. Aucun monde historique n'est promu par ce lot.

| Chantier | Livraison | Limite explicite |
| --- | --- | --- |
| OBS-01 | Registre de 48 missions, 88 tentatives, 324 mondes, dont cinq refus sans monde | Premier symptôme audité distinct de cause prouvée ; références non résolues conservées |
| CON-01 | Texte original scellé, clauses sans perte avec offsets, exigences, fixtures et références distinctes | Matrice historique documentaire ; aucun des 48 contrats n'est automatiquement approuvé |
| CON-02 | Contrat public strict ; oracle et nonce privés, engagement salé | Une réponse collée manuellement dans du texte libre exige toujours une revue sémantique |
| CON-03 | Vérifications ciblées Pareto, index binaire et contraintes d'exploration | Vecteurs à authentifier ; déclarations d'interface distinctes d'une UI exécutée |
| CON-04 | Candidat et résultat accepté distingués ; hashes du contrat/candidat et reçus indépendants requis | Authentification via callback de confiance ; intégration du gate final prévue en L4 |
| OBS-02 | Séquences par mission/monde, identités de phase et corrélations mission/expérience/worker/run/workspace | Les événements du processus supervisé sont observés ; ils ne certifient pas la validité de la décision |
| OBS-03 | Manifest du design et du bootstrap worker, prompt effectif hashé, lease et autorité hashés, commit/arbre observé | Modèle effectivement inféré inconnu sans observation d'un émetteur de confiance |
| OBS-04 | Dates UTC qualifiées, cutoffs des observations, capture SQLite Online Backup | Cutoff de capture fourni séparément ; aucune atomicité inter-fichiers ou multi-bases revendiquée |

## Contrats et faux positifs

[trinityQualificationContract](../../backend/src/services/trinityQualificationContract.js)
expose `create`, `publicProjection`, `validate`, `promptInstruction` et `verify`.
Seul `publicContract` entre dans `request.trinityContract` lors du dispatch explicite.
Le texte de `request.mission` doit rester exactement le texte original du contrat.
Une requête sans ce nouveau champ reste compatible et `legacy_unqualified` ; un
ancien contrat fourni explicitement dans `trinityContract` est rejeté comme mal versionné.
Les entrées ajoutées pour rendre une mission exécutable appartiennent aux fixtures,
avec leur portée et leurs limites, pas au texte original.

`create` rend aussi `privateOracle` et `privateOracleNonce`. Ces deux valeurs sont
conservées hors du request et du workspace public, côté vérificateur. Le nonce
évite qu'un hash d'une petite réponse permette de la deviner. La projection rejette
les champs inconnus et une enveloppe privée injectée dans le contrat public.

[trinityQualificationSemantics](../../backend/src/services/trinityQualificationSemantics.js)
reproduit les erreurs de l'audit comme contrôles négatifs :

- Une architecture moins chère, mais plus lente, ne domine pas l'autre lorsque les
  deux objectifs doivent être minimisés. Toutes les dimensions et leurs directions
  déclarées sont vérifiées ; cette comparaison ne prouve pas que les mesures sont réelles.
- Un index positif de recherche binaire échoue si la valeur à cet index n'est pas la
  cible. Les doublons et les politiques premier/dernier/quelconque sont explicites.
- Des tabs, un arbre de menu ou une recherche ne deviennent pas admissibles parce
  qu'ils ont été renommés. Les gestes restent distincts d'une barre de navigation.
  Le service vérifie une proposition structurée, pas l'exécution ni l'utilisabilité d'une UI.

Un résultat accepté exige des reçus authentifiés par un callback de confiance,
un acteur et un workspace indépendants, les hashes du candidat/contrat/vérificateur,
la version, les exigences couvertes et la portée exacte. `coverage` reste `null`
tant qu'une couverture opposable n'a pas été mesurée. `promotionAuthorized` reste faux.

## Traçabilité réellement branchée

[trinityDispatchPreparation](../../backend/src/services/trinityDispatchPreparation.js)
conserve le manifest et les hashes des prompts dans le design scellé. Un rejeu
avec contrat ou prompt différent est refusé. Le handler trace aussi un refus de
composition avant création d'expérience ; la contrainte de diversité est conservée.

[trinityQualificationDispatch](../../backend/src/services/trinityQualificationDispatch.js)
est appelé au bootstrap, après résolution des identités, du workspace, du contrat,
du budget, du lease et du run. Il conserve le prompt effectif et les identifiants
corrélés. Un même run reprend son timestamp scellé ; modifier le prompt ou le lease
n'est pas un rejeu identique. Les manifests sont immuables en SQLite.

[trinityExecutionJournal](../../backend/src/services/trinityExecutionJournal.js) ajoute
les traces via [trinityJournalTrace](../../backend/src/services/trinityJournalTrace.js).
Un échec suivi d'une reprise produit `started → failed`, puis une nouvelle phase
`started → completed → replayed`. Les corps des résultats restent dans le journal
existant ; les nouvelles traces stockent leurs hashes. Un ancien cache produit une
observation `legacy-cache-observation`, avec cutoff, sans faux début ni fausse fin.

[trinityRuntimeTrace](../../backend/src/services/trinityRuntimeTrace.js) relie les événements
persistés par le superviseur au manifest du run. Un `EVIDENCE_REPORT` observé reste
une déclaration du worker, sans autorité de décision. Les chemins de clôture des
adapters restent à harmoniser dans L3 ; les récits internes non observés ne sont pas reconstruits.

[trinityRunManifest](../../backend/src/services/trinityRunManifest.js) sépare la configuration
demandée de `observedRuntime`. Déclarer une observation requiert une source, un hash,
une date et une catégorie d'émetteur admise. Cela ne remplace pas l'authentification
de l'émetteur. Les fixtures/vérificateurs référencés sont hashés comme JSON de
références ; les empreintes des fichiers réels doivent être fournies quand ils sont capturés.

## Reconstruction du registre

Les outils sont dans [scripts/trinity-evidence](../../scripts/trinity-evidence/registry.py).
Les sources restent les trois audits scellés et le catalogue original des missions.
Le manifeste de l'audit est épinglé à :

`c7bcf8ab4c786173aba0e7b9fc12ea4dc53ff2ecf024ab55c40b9c69a7fde6b4`.

```powershell
python scripts/trinity-evidence/registry.py --audit-root "<audit-local>" --missions "<missions.json>" --output ".genos-agent-worlds/trinity-l1-20261006"
python scripts/trinity-evidence/registry.py --audit-root "<audit-local>" --missions "<missions.json>" --output ".genos-agent-worlds/trinity-l1-20261006" --verify-output
python -m unittest discover -s scripts/trinity-evidence -p "test_*.py"
```

La sortie générée reste ignorée par Git. Elle contient les index, missions,
tentatives, workers, problèmes, observations de fuite de réponses et références
non résolues. Elle ne recopie ni prompts de workers, ni logs bruts, ni bases, ni
environnements. Une relecture reconstruit les fichiers depuis les sources et refuse
les omissions, falsifications de PASS, liens altérés et différences d'empreinte.

Résultat attendu et contrôlé : **48 / 88 / 324**, **71 PASS historiques de fixtures**,
**5 refus hétérogènes**, **0 promotion**, **0 mission sémantiquement requalifiée**.
La grille comporte **120 clauses originales et 227 critères proposés**. Le registre
indexe **6 187 références**, **9 528 occurrences**, **sept observations de risque de
réponses préchargées** et **18 liens non résolus**. Ces derniers restent inconnus.
L'index final généré est épinglé à :

`9203559f6ab67da81fa854b549e20d0a196362058d522a57deff2a4eb6aa177d`.

Ces nombres décrivent le corpus historique ; les tests de L1 ne sont pas ajoutés
aux réussites publiées de cette campagne.

## Validation du changement

```powershell
node backend/tests/test_trinity_qualification_contract.js
node backend/tests/test_trinity_l1_provenance.js
node backend/tests/test_trinity_l1_integration.js
node backend/tests/run_trinity_suite.js
python scripts/ci/check_code_quality.py
npm test
# Positionner CARGO_TARGET_DIR vers un dossier de compilation disposant d'espace.
cargo test --workspace --offline
```

| Contrôle exécuté | Résultat |
| --- | --- |
| Contrats de qualification | 14 scénarios PASS, incluant les trois faux positifs ciblés |
| Provenance | PASS : altération/replay, séquences concurrentes sur deux connexions, identité, cutoffs et vraie capture de données WAL |
| Intégration L1 | PASS : préparation réelle, conflits de contrat/prompt, scope muté rejeté, runtime inconnu, refus de diversité sans monde, reprise et ancien cache |
| `npm --prefix backend run test:trinity` | 31 fichiers de tests PASS sur 31, après intégration et durcissement des corrélations |
| `cargo test --workspace --offline` | Exit 0 ; compilation et tests exécutés avec les sorties de compilation sur D |
| `npm test` | Exit 1 : biologie 7/7 et backend 55/55 passent, puis Cedar et relations passent ; arrêt sur la dépendance absente `@biscuit-auth/biscuit-wasm` |
| Tests du registre | 20 tests PASS ; reconstruction des 12 fichiers depuis les sources scellées PASS |
| Qualité stricte L1 | 33 fichiers source contrôlés, aucune violation ; limites 400 lignes / trois paramètres / complexité 10 |
| Gate qualité global | Exit 1 : 5 239 fichiers source, 299 violations, dont 153 nouvelles vis-à-vis de la baseline, extérieures aux 33 fichiers L1 |
| Index des ADR | 417 fichiers et 417 entrées, aucun problème |

Une exécution parallèle supplémentaire du test de préparation a rencontré `ENOENT`
sur le snapshot temporaire lors de son installation. Sa cause n'est pas établie.
La relance isolée et les deux suites Trinity complètes ont passé ce même test ;
ce symptôme n'est pas transformé en preuve d'absence de course.

La révision Git du manifest du bootstrap est héritée du dispatch ; elle n'atteste
pas à elle seule le binaire effectivement chargé ni ses dépendances. L'observation
du runtime et le scellement des capsules restent à compléter dans les lots suivants.
L'empreinte observée du dépôt partagé ne constitue pas un checkout de release isolé.

## Suite du plan

L2 doit corriger les identités, capsules et profils de workers ; L3 les budgets et
clôtures ; L4 la preuve indépendante et le rapport canonique accepté ; L5 les
comparaisons et promotions ; L6/L7 les variants et composants ; L8 les 48 missions
avec protocoles corrigés et contrôles causaux. L1 ne prétend pas fermer ces lots.

Le workflow mémoire GenOS a été utilisé pour les hypothèses et expériences. Aucun
chemin de genome/snapshot de hook de session n'a été fourni : le checkpoint du
plugin et son enforcement restent non vérifiés. Les tests locaux ne les remplacent pas.
