# ETT-BENCH 2026 — campagne expérimentale

**Statut :** deux chemins sont disponibles. `run_runtime_campaign.js` traverse les vrais services ETT backend avec un modèle local et un oracle séparé. `run_reference_campaign.js` est un contrôle déterministe rapide des contrats. Aucun niveau ETT n'est qualifié tant que les holdouts, ablations et systèmes concurrents requis n'ont pas tous été exécutés.

## Exécuter le harnais de référence

```powershell
node benchmarks/ett/run_reference_campaign.js --seeds 30 --output benchmarks/ett/reports/reference-run.json
```

Le fichier de sortie doit être nouveau : le runner refuse de l'écraser. Pour une exécution de développement plus courte, remplacer `30` par `1`. Chaque seed génère une instance pour chacune des 36 paires scénario/difficulté. Les échecs restent dans le dénominateur. Les réponses sont vérifiées dans un processus distinct et le reçu précise `scientificClaimAllowed: false` et `externalModelCostsMeasured: false`.

## Exécuter le vrai runtime ETT

Le runner suivant appelle `endogenousThoughtCampaignExecutor`, qui utilise les services existants de détection, admission, exécution sandboxée, vérification signée, apprentissage et reprise. Le modèle est appelé par `backend/src/services/modelProvider`; la proposition ne voit jamais l'oracle. Ollama utilise par défaut le modèle local `qwen2.5-coder:7b` détecté dans cette session ; un autre modèle peut être choisi explicitement.

```powershell
npm run benchmark:ett:runtime -- --model ollama://qwen2.5-coder:7b --seeds 1 --scenarios priority --conditions full,planned_control --output benchmarks/ett/reports/runtime-priority-pilot.json
```

Le reçu est écrit progressivement par remplacement atomique et ne contient pas la réponse cachée. Les compteurs de tokens sont ceux retournés par Ollama ; la durée est celle de l'hôte et le coût monétaire est déclaré zéro pour l'inférence locale. Le budget maximal de 250 000 tokens s'applique à toute la campagne et ne se réinitialise pas lors d'une reprise ; le runner garde une réserve avant le prochain cas. Chaque segment et sa consommation restent dans le reçu. `llm_only` appelle directement le même modèle sans services ETT. Chaque concurrent possède son propre adaptateur dans `adapters/independent/`, sa politique et son éventuel état ; tous utilisent le même modèle et la même limite par appel. À la reprise, le runner valide les observations stockées, ignore les paires déjà terminées et restaure la mémoire de preuves vérifiées du proxy Voyager. Les seeds peuvent uniquement être prolongées en conservant leur préfixe. Un relèvement de budget doit être fourni explicitement avec `--token-budget` et est historisé dans le reçu. Ce sont des adaptations locales, jamais les systèmes originaux. Exemple : `--conditions full,llm_only,react_classic,periodic_llm_loop,voyager_adapted,ai_scientist_v2_adapted,darwin_godel_machine_adapted`. Les essais sont appariés par scénario, niveau et seed ; ils restent `development`, `holdout: false`, et aucune conclusion scientifique n'est permise à partir du pilote.

Pour reprendre un reçu qui possède encore du budget, rappeler les mêmes modèle, scénarios et conditions, avec `--resume` au lieu d'un nouveau fichier de sortie :

```powershell
npm run benchmark:ett:runtime -- --model ollama://qwen2.5-coder:7b --seeds 30 --scenarios all --conditions full,curiosity_ablated,memory_ablated,llm_only,react_classic,periodic_llm_loop,voyager_adapted,ai_scientist_v2_adapted,darwin_godel_machine_adapted --token-budget 250000 --resume benchmarks/ett/reports/campaign-partial.json
```

On peut étendre `--seeds 1` à `--seeds 10`, puis `--seeds 30` ; les seeds déjà dans le reçu doivent rester un préfixe identique. Un reçu ayant consommé le plafond est terminé et ne peut reprendre qu'après relèvement explicite de `--token-budget`.

Pour vérifier qu'un reçu déterministe de référence se rejoue à l'identique (hors durée mesurée) :

```powershell
node benchmarks/ett/evaluation/replay.js --input benchmarks/ett/reports/domain-reference-30seed.json --output benchmarks/ett/reports/domain-reference-30seed-replay.json
```

Pour sélectionner les 12 scénarios, utiliser `--scenarios all`. La matrice visée A0–A5 est décrite dans `configs/ablations.yaml` ; seules A0 et A1 ont une condition runtime directe, A2 et A4 sont des proxys partiels, A3 et A5 ne sont pas implémentées. Le garde conserve une réserve de 12 000 tokens et s'arrête avant le prochain cas quand le reste passe sous cette réserve ; son statut indique ce seuil, même si une partie du budget reste inutilisée.

## Scénarios exécutables et adaptateurs

Chaque dossier `scenarios/ett_*/scenario.js` expose `createWorld(difficulty, seed)`, `world.act(action)` et `world.result()`, ainsi qu'un CLI autonome. L'observation initiale donne l'objectif, les identifiants de candidats et le prochain type d'action requis, sans divulguer leurs preuves. Chaque épreuve suit un protocole propre : question et test d'anomalie, cycles de recherche, transfert et rétention, prédiction sur état frais, etc. Les preuves ne sont révélées que par les actions qui les demandent. La réponse ne peut être soumise qu'après les étapes requises et l'inspection de son candidat. Les erreurs consomment le budget; ETT-02 exige 5/12/20 cycles selon le niveau et ETT-12 en exige 10/50/100. L'oracle exige les références de chaque étape. Exemple autonome :

```powershell
node benchmarks/ett/scenarios/ett_01_curiosity/scenario.js simple 1001 '[{"type":"inspect_sensor_stream","candidateId":"candidate-0"},{"type":"form_research_question","question":"Why does this stream depart from its baseline?"},{"type":"test_anomaly_hypothesis","candidateId":"candidate-0","method":"compare repeated readings"},{"type":"submit_answer","answerId":"candidate-0"}]'
```

Le runner runtime emploie ce même contrat pour GenOS, le contrôle direct LLM et les adaptateurs concurrents; les reçus utilisent le schéma v4 et conservent l'observation publique, son hash, les traces d'action, les appels fournisseur, les coûts mesurés et le verdict. L'usage détaillé par appel est durablement écrit dans le fichier adjacent `<reçu>.usage.jsonl`; une reprise vérifie ce journal et refuse un appel interrompu dont l'usage est inconnu. Les reçus v3 sans journal ne sont pas repris sous le schéma v4. Les mondes déterministes de calibration ne remplacent pas des expériences scientifiques réelles ni les évaluations natives concurrentes.

`adapters/referenceSystems.js` expose des contrôles déterministes de format et un score oracle-aware pour valider le harnais ; ce ne sont pas des systèmes ETT et le contrôle supérieur oracle-aware n'est pas un comparateur de performance. Les cinq modules sous `adapters/independent/` sont des politiques distinctes sur le même modèle, les protocoles propres aux scénarios et le même plafond par appel : ReAct observe puis agit, la boucle périodique réévalue sans mémoire persistante, Voyager adapté réutilise des compétences vérifiées, AI Scientist v2 adapté formule une hypothèse et une expérience, et DGM adapté sélectionne une stratégie sans modifier de code. Chaque module reçoit uniquement l'observation publique et les réponses d'actions; l'oracle reste dans le processus de vérification. Ces adaptations locales ne sont pas les exécutables originaux : Voyager, AI Scientist v2 et DGM natifs demeurent indisponibles dans `configs/systems.yaml`.

Le vérificateur lit le secret uniquement dans `evaluation/oracle_worker.js`, lancé dans un processus Node enfant. Ce cloisonnement réduit la fuite accidentelle dans le harnais local ; ce n'est pas une frontière de sécurité résistante à un opérateur qui contrôle la machine. Le runtime modèle conserve les appels et tokens déclarés par le fournisseur ainsi que le temps hôte; le coût monétaire local est zéro. Le contrôle de référence, lui, ne fait aucun appel fournisseur.

## Campagne scientifique et limites

Le protocole scientifique v2 (`benchmarks/endogenous-thought/protocol-v2.json`) compare `full` à `llm_only` via des providers injectés, un vérificateur indépendant et un mesureur externe. `run_campaign.js` conserve cette intégration. Elle ne fournit pas à elle seule les concurrents ni la matrice A0–A5 complète. Ses contraintes de corpus et son exécution des providers doivent être respectées ; ne remplacez pas les preuves manquantes par des scores nuls.

Les adaptateurs de référence déterministes sont des contrôles de pipeline. Les concurrents Voyager, AI Scientist v2 et DGM restent des proxies, pas leurs exécutables originaux. Le runner runtime peut inclure GenOS, le contrôle direct LLM et les cinq politiques concurrentes distinctes. En v3, les 36 paires scénario/niveau requièrent 320 actions de monde par condition et par seed (284 étapes de protocole et 36 soumissions), avant les appels de génération de questions GenOS, reprises ou actions invalides. La matrice des 13 conditions enregistrées et 30 seeds représente donc au moins 124 800 appels d'action modèle, plus les appels de génération endogène. L'ancienne estimation en tokens, faite sur v2, ne s'applique plus. Le plafond global de 250 000 tokens reste actif; aucun run LLM complet n'est déclaré faisable sans nouveau pilote borné et budget explicitement révisé.

La campagne complète reste inachevée tant qu'un corpus holdout scellé, des environnements réalistes, les adaptateurs concurrents fidèles, le contrôle direct, au moins 30 seeds, toutes les ablations et l'audit de replay n'ont pas été obtenus dans le budget. Aucun niveau ETT-L1 à ETT-L5 ni classement scientifique n'est revendiqué.

Le protocole runtime v3 impose les étapes propres à chaque épreuve et enregistre leurs traces; les reçus utilisent le schéma v4 pour inclure le journal de budget par appel. Les protocoles runtime v1/v2 et les reçus v3 sans journal ne peuvent pas être repris. Les rapports historiques restent des traces d'anciens protocoles, sans qualification v3. Le pilote synthétique de développement préexistant est archivé dans [`reports/development-pilot.json`](reports/development-pilot.json) ; il ne constitue pas un résultat de cette campagne. Les statistiques de bootstrap apparié et de correction de Holm sont disponibles dans `evaluation/statistics.js`.
