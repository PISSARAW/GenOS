# Résultats des expériences d’auto-guérison — 2026-10-22

- **Révision testée** : `7cbd86a86d421787d5e543814e861a6ff31d5208`
- **Environnement** : exécution locale Windows, dépôt `GenOS`, Node.js installé
- **Verdict** : six tests ciblés réussis ; auto-guérison autonome sur lésion inconnue non démontrée
- **Portée** : résultats des commandes lancées le 22 octobre 2026. Aucun résultat de terrain ou de VM Hyper-V n’est revendiqué.

## Exécutions

Chaque commande ci-dessous a été exécutée depuis la racine du dépôt. Toutes ont terminé avec le code de sortie 0.

| Expérience | Résultat observé | Ce que cela établit |
| --- | --- | --- |
| `node backend/tests/test_shev_healing_contract.js` | Réussi : phases durables, preuves et protection terminale | Contrat SHEV testé |
| `node backend/tests/test_shev_healing_integration.js` | Réussi : tick, Ontogenesis, effet, suivi longitudinal | Intégration et machine d’états testées ; les fonctions `verify` de cette expérience renvoient des résultats préfabriqués |
| `node backend/tests/test_physiological_arc_closed_loop.js` | Réussi : quatre connexions physiologiques annoncées | Fermeture de boucle dans le banc d’essai |
| `node backend/tests/test_sre_healing_policy.js` | Réussi : 10 tests, 0 échec | Politique d’autorisation, abstention, contre-vérification et rollback demandés testés |
| `node backend/tests/test_sre_healing_store.js` | Réussi : 3 tests, 0 échec | Persistance, transitions liées et concurrence optimiste testées |
| `node backend/tests/test_security_qualification_lab.js` | Réussi : `PASS test_security_qualification_lab` | Corpus et classification, y compris l’échec d’overclaim, exécutés ; le scénario SHRE est l’adaptateur isolé décrit ci-dessous |

Les sorties exactes des quatre premiers tests sont résumées par leurs messages de réussite ci-dessus ; les deux suites Node affichent respectivement `10 pass / 0 fail` et `3 pass / 0 fail`.

## Expérience SHRE observée dans le laboratoire

`test_security_qualification_lab.js` appelle réellement `qualifyShreIsolatedVmCycle`. Le cycle écrit un fichier `test-vm-state.json` dans un répertoire temporaire, applique `networkIsolation=true` et `rdpEnabled=false`, vérifie l’état, puis restaure la sauvegarde. Les assertions vérifient `stateMutatedOnApply=true`, `causalVerificationStatus=PASS` et `exactRollbackVerified=true`. Le reçu est donc une preuve de mutation et de restauration d’un artefact local.

L’inspection de `backend/src/services/cyberCorpActionGateway/cyberCorpActuators.js` établit aussi les limites : l’état cible est un JSON, `simulate` retourne un résultat fabriqué par l’adaptateur, et `createIsolatedVmIndependentVerifiers` construit le contre-test et le vérificateur causal dans le même module avec des réponses déterminées par l’état JSON. L’identifiant `env:hyperv-isolated-sandbox-01` est une valeur déclarée par cette simulation ; aucune connexion Hyper-V n’est effectuée. Cela ne démontre donc ni une réparation sur une VM réelle, ni une vérification indépendante réelle.

## Échec de qualification SH-001

**Critère** : une lésion cachée et inconnue est diagnostiquée puis réparée par GenOS sans guidage, avec un oracle indépendant sur le système modifié.

**Verdict** : non démontré dans cette exécution. Aucun runner SH-001 avec défaut inconnu, bras témoin, agent réparateur autonome et oracle distinct n’a été lancé. Les six tests ciblés sont des tests locaux déterministes ; ils ne satisfont pas ce critère. Aucun défaut d’implémentation n’a été révélé par ces six exécutions, donc aucun correctif de code n’a été appliqué.

La procédure de répétition accélérée SHEV (`docs/04-exploitation/repetition-generale-campagne-terrain-shev.md`) indique elle-même qu’aucune répétition n’y est rapportée et requiert deux workspaces jetables, un manifeste scellé, une archive et huit injections de panne. La campagne terrain mentionnée dans `docs/04-exploitation/executer-campagne-terrain-shev.md` exige au moins 72 heures. Ni cette répétition complète ni une nouvelle qualification de terrain n’ont été exécutées ici.

## Conclusion

Les expériences établissent que plusieurs mécanismes de guérison ont des tests locaux qui passent, et que le cycle SHRE peut muter et restaurer un fichier sandbox avec contrôle d’empreinte. Elles n’établissent pas l’auto-guérison autonome, causale, indépendante et durable d’une lésion inconnue. Le résultat négatif de qualification doit rester attaché aux succès techniques : annoncer une guérison générale sur cette base serait un overclaim.

## Expérience réelle Qwen sur D: — T02, tentative 24

- **Banc** : `D:\GenOS\runs\autonomy-proof-t02-20261022`, orchestration exécutée depuis le checkout `D:\GenOS\identity-real-llm-worktree`.
- **Modèle** : `qwen2.5-coder:32b` via Ollama local.
- **Oracle** : suite Playwright immuable `npm test`, fournie dans le workspace isolé; elle vérifie formulaire accessible, ajout, filtre, recherche, quantité persistée, export JSON, validation, suppression, mode hors ligne et affichage mobile.
- **Résultat** : échec avant application du patch. Après 281,9 s et 891 tokens de sortie, le parseur a rejeté la proposition avec `Unterminated string in JSON at position 3148 (line 6 column 3057)`. Aucun `index.html` n’a été créé; `npm test` n’a donc pas tourné. Le gate a terminé en `evidence_missing` et n’a pas annoncé de guérison.
- **Interprétation** : cet essai mesure une défaillance réelle de génération/formatage du worker Qwen, pas un défaut fonctionnel de l’application. Le refus strict et l’absence de patch dans le workspace sont le comportement de sûreté attendu. La réussite T02 n’est pas démontrée par cette tentative.
- **Reproductibilité** : requête source `D:\GenOS\runs\autonomy-proof-t02-20261022\project\attempt-24.json`; reçu opérationnel `D:\GenOS\runs\autonomy-proof-t02-20261022\genos-attempt-24.db`. Le journal `RUN_LOG.md` et ces artefacts résident sur D: et ne font pas partie du dépôt Git.

## Complément — expériences Qwen réelles sur D:

Les tentatives suivantes utilisent des workspaces Pantry isolés et le modèle Ollama local `qwen2.5-coder:32b`. Le reçu indépendant est la suite Playwright `npm test`; les patches candidats sont restaurés après échec. Les tentatives 40–42 ont été lancées depuis le binaire C: avec workspace D: et ne qualifient donc pas le code du checkout D:. À partir de 44, le CLI utilisé est `D:\GenOS\identity-real-llm-isolated\backend\bin\genos-orchestrate.cjs` (révision observée `b12d97678`), avec base SQLite dédiée/clonée.

| Tentative | Exécution / résultat vérifié | Qualification |
| --- | --- | --- |
| 39 | Les assertions fonctionnelles atteignent le téléchargement JSON, puis l’oracle original rejette `pantry-items.json` à cause de la regex `/\\.(json|csv)$/i`, qui attend une barre oblique inverse littérale avant le point. | Échec d’oracle démontré. |
| 40 | Le workspace isolé corrige uniquement cette regex en `/\.(json|csv)$/i` (original archivé sous `oracle-attempt-40-original.cjs`). Qwen produit un candidat de 5 192 octets; Playwright passe jusqu’au bouton d’incrémentation, absent sous le nom accessible attendu. | Échec application vérifié à `acceptance.cjs:23`. |
| 41 | Qwen produit 6 146 octets; Playwright constate deux contrôles nommés `Category` et échoue en mode strict au sélecteur `acceptance.cjs:16`. | Échec application vérifié. |
| 42 | Préflight et postflight exécutés par le lanceur C:; aucun candidat ni reçu Playwright dans le workspace. | Non concluant; exclu de la preuve du checkout D:. |
| 43 | Lanceur du checkout D: démarré, puis session et processus terminés sans événement de fin du ledger ni reçu de test. | Non concluant; aucun résultat applicatif inféré. |
| 44 | Depuis le CLI D:, Qwen rend une proposition mais le worker la rejette avant Playwright: le manifeste exigeait la chaîne littérale `aria-label="Category"`, absente d’un candidat qui utilisait un label HTML visible. Aucun test applicatif n’a tourné. | Faux négatif du contrat de marqueurs; le manifeste suivant retire ce marqueur de forme, sans toucher à l’oracle. |
| 45 | Depuis D:, le candidat initial de 4 212 octets échoue car le label `Category` ne résout pas le locator exact. `LOCAL_CODE_TEST_REPAIR` démarre le retry 1; le deuxième candidat résout le locator mais son select n’offre pas l’option `Food`. Un troisième appel Qwen est lancé, puis expire après 230 662 ms, le budget résiduel étant de 230 783 ms. Le chemin d’échec lève ensuite `IDENTITY_SESSION_STALE`; aucun succès n’est enregistré. | Deux cycles de réparation Qwen et deux reçus Playwright réels démontrés; mission non réussie, limite de délai et erreur secondaire de session enregistrées. |
| 46 | CLI D:, base et workspace isolés, budget porté à 1 800 000 ms. Le préflight, `LOCAL_WORKER_STARTED` et `INFERENCE_STARTED` existent, mais aucune complétion modèle, proposition, suite Playwright ou clôture de mission n’a été écrite avant l’arrêt de la session. | Non concluant; ne pas présenter comme échec fonctionnel ni comme succès. |

### Correctif du format de réponse Ollama

Pour éviter que la réponse structurée Ollama refuse certains schémas `allOf/contains` complexes, `proposalResponseFormat` n’impose plus les marqueurs et minimums d’octets au niveau du schéma généré. Ces exigences restent appliquées côté worker par `assertRequiredPatchContract` après parsing; chemins, nombre de patches et allowlist restent contraints. `node backend/tests/test_local_code_worker.js` échoue en sandbox standard uniquement sur la création de symlink Windows (`EPERM`); la même commande, relancée avec l’autorisation locale requise par ce test de sécurité, passe avec `Local code worker safety checks passed.`

### Portée des résultats

Cette série démontre que le worker D: peut appeler Qwen 32B, recevoir de vrais candidats, exécuter Playwright, transmettre les assertions au retry et préserver les échecs. Elle ne démontre pas T02 réussi: aucune tentative de cette série n’a atteint `test_suite_passed` et aucune n’a franchi la porte de complétion. Le succès de la suite locale du worker valide le contrat de sûreté, pas l’app Pantry. Les expériences T01–T08 et le critère SH-001 restent à qualifier séparément.
