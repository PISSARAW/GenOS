# Coopération LLM : relance depuis le constat du daemon

- **Statut** : correctif testé ; qualification réelle refusée dans les deux cas.
- **Date** : 2026-11-04.
- **Code exécuté** : commit `d87d6909e3c879cb5625f874c930e106573c9d53`.
- **Résultats antérieurs conservés** : commit `a868607a1` et [rapport des deux plans refusés](cooperation-llm-plan-refuse-2026-11-04.md).
- **Contrat** : [guide de planification](../02-orchestration/planification-cooperation-depuis-constat.md), [ADR 0793](../adr/0793-plan-cooperation-fonde-sur-constat.md).

## Correction et protocole

Le daemon observe désormais avant tout appel de planification. Le planificateur
reçoit uniquement un constat dont le binding, le reçu, la vérification native et
les empreintes des sources ont été contrôlés. Son entrée conserve les faits,
les références et le run du daemon. Les étapes restantes doivent respecter leurs
prérequis ; un constat sain demande un arrêt sans worker supplémentaire.

La relance utilise une extraction du commit sur D:, sans modification du code
après commit, deux bases SQLite distinctes et un serveur Ollama dédié. Aucun
transport de test ni réponse prédéfinie ne remplace le modèle. Les dépendances
Node installées sont accessibles par jonctions ; les sources du runtime, modèles,
bases, capsules, fichiers temporaires et résultats de qualification sont sur D:.

- Exécutable : `D:\ollama\ollama.exe`, version `0.40.12`.
- Modèle : `qwen2.5-coder:7b`, Q4_K_M, 7,6 milliards de paramètres.
- Digest : `dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
- Serveur : `http://127.0.0.1:11457/api/chat`, un appel parallèle au maximum.
- Racine des preuves locales : `D:\GenOS-runs\cooperation-finding-20261104-114901\real`.
- Provenance : `provenance.json`, configurations et fichiers `*.execution.json`.
- Rapports bruts : `incident/report.json`, `healthy/report.json`.
- Audit indépendant en lecture seule : `audit.cjs`, `analysis-evidence.json`.
- Tests ciblés gelés : arbre `211c548e045b88c95ae5bf1c762333c8ec4bccec`.

Les deux allocations utilisent les valeurs `[4,9,6,3,8]`, une cible de 17 et
des indices depuis zéro. Les entrées complètes figurent bien dans les prompts
effectivement enregistrés. Aucune perte de ces faits n'a été observée.

## Résultats réels

| Mesure | Allocation incorrecte | Allocation saine |
| --- | --- | --- |
| Indices observés | `[0,1]` | `[1,4]` |
| Constat attendu | somme 13, anomalie vraie | somme 17, anomalie fausse |
| Début UTC du rapport | 12:10:36.080 | 12:13:42.780 |
| Durée du pilote, après initialisation de la base | 85 442 ms | 127 506 ms |
| Tokens d'entrée / sortie | 3 409 / 569 | 3 401 / 330 |
| Total modèle | 3 978 | 3 731 |
| Tokens du planificateur | 0 | 0 |
| Workers exécutés | 1 daemon | 1 daemon |
| Processus d'oracle natif | 2 | 2 |
| Temps cumulé des processus d'oracle | 624 ms | 4 348 ms |
| Verdict du pilote / code de sortie | refus / 1 | refus / 1 |

Les deux runs de daemon sont respectivement
`strategy_run_1793794249109_6b0a4fad` et
`strategy_run_1793794438272_415f2cc3`.

### Allocation incorrecte

Le modèle produit deux claims, alors que le contrat en demande exactement un.
Le premier énoncé est `observedSum:13,target:17,anomaly:true`, une chaîne qui
n'encode pas un objet JSON valide. Le second additionne toutes les valeurs (30)
au lieu de traiter l'allocation sélectionnée (13).

Les deux oracles indépendants, `source_recompute` et `cross_check`, sortent
normalement, mais rendent `inconclusive`, raison `structured_candidate_required`.
Le refus immédiat porte sur la forme du candidat. L'erreur de raisonnement dans
le deuxième claim est une observation supplémentaire de l'analyse, pas un verdict
arithmétique que les oracles auraient atteint après ce premier refus.

### Allocation saine

Le modèle produit un seul claim : `observedSum:27, target:17, anomaly:true`.
Il n'est pas encodé en JSON et son contenu contredit l'allocation `[1,4]`, dont
la somme vaut 17. Les deux oracles sortent normalement et restent
`inconclusive`, avec une erreur de lecture JSON commençant par `Unexpected token 'o'`.

Dans les deux cas, l'assemblée native n'est pas acceptée et le runtime bloque
le daemon avec `ORACLE_ASSEMBLY_NOT_ACCEPTED`. Le refus intervient avant la
construction d'un constat admissible et avant tout appel au planificateur.

## Autorité, fermeture et ressources

Les deux daemons sont sans droits d'écriture, de délégation ou de promotion.
Les empreintes des fichiers sources sont inchangées. Aucun spécialiste,
vérificateur worker ou worker de récupération n'est lancé. Il n'existe ni plan
accepté, ni restauration, ni promotion. `qualified`, `protocolCompleted` et
`genosMissionQualified` restent faux dans les deux rapports.

L'audit SQLite constate zéro run `planned/running` et zéro récupération
`queued/claimed/retry` après fermeture, avec `shutdown.stopped: true`.
Les identités du daemon sont `idle`. L'identité racine conserve toutefois
`agents.status: running` ; ce champ ne constitue donc pas une preuve de processus
actif ou de mission achevée. Cette incohérence de projection reste visible dans
l'audit et n'est pas assimilée à un succès.

Le serveur dédié et ses seuls descendants, PID 20028, 32776 et 36428, ont été
arrêtés. Le contrôle du 2026-11-04 à 12:16:29 UTC confirme leur absence et
l'absence de listener sur le port 11457. Les autres serveurs ne sont pas arrêtés.

Le total est de **7 709 tokens**, deux appels fournisseur et quatre processus
d'oracle, pour 4 972 ms de calcul d'oracle cumulé. La comptabilité fournisseur
correspond aux totaux des rapports et inclut chaque tentative. Aucun token de
planification n'est consommé. Le plafond reste 68 096 tokens par cas, dont
64 000 partagés entre workers et 4 096 pour la planification.

La télémétrie fournisseur déclare 0 USD pour l'exécution locale. Le coût matériel,
l'électricité et le pic mémoire ne sont pas mesurés. Une observation du serveur
chargé indique 5 635 173 252 octets de VRAM pour ce modèle ; elle ne mesure pas
un pic ni la consommation globale du GPU, partagé avec d'autres processus.

## Validation du correctif

Les tests ciblés exécutés depuis la copie gelée sur D: passent :

- contrat du planificateur : types exacts, références étrangères, prérequis,
  ordre incorrect, arrêt sain et sources modifiées ;
- intégration à transport contrôlé : réparation complète, arrêt sain, refus d'un
  plan mal ordonné et fermeture après abstention du daemon.

Ces tests utilisent les vrais dispatchs, capsules, reçus et oracles natifs,
avec des générations HTTP prédéfinies. Ils prouvent le raccordement et les
refus du contrat ; ils ne qualifient pas la capacité du vrai LLM.
Le gate de qualité ciblé passe sur les huit fichiers source du correctif.

Les vérifications globales ont été exécutées sur le checkout partagé, qui contient
d'autres travaux ; elles ne sont pas vertes :

- `python scripts/ci/check_code_quality.py` : complexité 12 > 10 dans
  `benchmarks/competence-five-arms-v2/control.cjs`, hors correctif ;
- `npm test` : timeout du processus dans
  `backend/tests/test_mission_protocols_omega_recovery.js` ;
- `cargo test --workspace -- --test-threads=1` : échec de
  `a_delegation_batch_denies_an_early_write_even_before_registration_then_accepts_a_later_retry`,
  avec `RUST_AGENTIC_MISSION_UNRESOLVED` dans le fixture Rust.

Les journaux exacts et codes de sortie sont conservés dans `real/checks`.
Ces échecs concernent des fichiers hors du correctif ; aucune conclusion causale
sur leur origine n'est tirée sans reproduction isolée.

## Conclusion et suite technique

L'ordre causal demandé est implémenté : un constat non vérifié ne peut pas
déclencher de planification. Les contrôles déterministes valident le passage
du constat aux trois rôles restants et l'arrêt conditionnel du cas sain.

La relance réelle reste une **qualification négative**. Le planificateur corrigé
n'a pas été exercé par le vrai modèle, car le daemon ne respecte pas encore son
contrat d'observation. La coopération complète, la décomposition réelle et la
restauration réelle ne sont donc pas démontrées par ces deux runs.

La prochaine expérience doit traiter le contrat de sortie du daemon : structurer
un unique objet de constat et conserver le rejet des observations fausses,
notamment sur une allocation saine. Les prompts enregistrés présentent aussi
des couches d'identité et d'ADN héritées ; leur influence est une hypothèse à
tester, pas une cause établie. Aucune normalisation permissive, réécriture des
réponses ou suppression d'oracle n'a été utilisée pour transformer ce refus en
succès.
