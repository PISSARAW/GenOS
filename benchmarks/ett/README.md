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

Le reçu est écrit progressivement par remplacement atomique et ne contient pas la réponse cachée. Les compteurs de tokens sont ceux retournés par Ollama ; la durée est celle de l'hôte et le coût monétaire est déclaré zéro pour l'inférence locale. Le budget maximal de 250 000 tokens est appliqué par invocation, avec une réserve avant le prochain cas. Chaque segment et sa consommation restent dans le reçu. `llm_only` appelle directement le même modèle sans services ETT. Chaque concurrent possède son propre adaptateur dans `adapters/independent/`, sa politique et son éventuel état ; tous utilisent le même modèle et la même limite par appel. À la reprise, le runner valide les observations stockées, ignore les paires déjà terminées et restaure la mémoire de preuves vérifiées du proxy Voyager. Les seeds peuvent uniquement être prolongées en conservant leur préfixe. Ce sont des adaptations locales, jamais les systèmes originaux. Exemple : `--conditions full,llm_only,react_classic,periodic_llm_loop,voyager_adapted,ai_scientist_v2_adapted,darwin_godel_machine_adapted`. Les essais sont appariés par scénario, niveau et seed ; ils restent `development`, `holdout: false`, et aucune conclusion scientifique n'est permise à partir du pilote.

Pour reprendre un reçu interrompu au plafond, rappeler les mêmes modèle, scénarios, conditions et budget, avec `--resume` au lieu d'un nouveau fichier de sortie :

```powershell
npm run benchmark:ett:runtime -- --model ollama://qwen2.5-coder:7b --seeds 1 --scenarios all --conditions full,curiosity_ablated,memory_ablated,llm_only,react_classic,periodic_llm_loop,voyager_adapted,ai_scientist_v2_adapted,darwin_godel_machine_adapted --token-budget 250000 --resume benchmarks/ett/reports/domain-runtime-pilot-qwen7b.json
```

On peut étendre `--seeds 1` à `--seeds 10`, puis `--seeds 30` ; les seeds déjà dans le reçu doivent rester un préfixe identique.

Pour sélectionner les 12 scénarios, utiliser `--scenarios all`. La matrice visée A0–A5 est décrite dans `configs/ablations.yaml` ; seules A0 et A1 ont une condition runtime directe, A2 et A4 sont des proxys partiels, A3 et A5 ne sont pas implémentées. Le garde conserve une réserve de 12 000 tokens et s'arrête avant le prochain cas quand le reste passe sous cette réserve ; son statut indique ce seuil, même si une partie du budget reste inutilisée.

## Portée des scénarios et adaptateurs

Chaque dossier `scenarios/ett_*/scenario.js` expose le générateur exécutable de son épreuve et son manifeste référence le module. Le runtime crée 12 mondes de calibration avec des observations structurées distinctes (anomalies de capteurs, planification d'expériences, interventions causales, transfert tenu à l'écart, réplications contradictoires, mises à jour bayésiennes, reprise de checkpoints, valeur d'information, prédictions sur état frais, patchs sandboxés, synthèses multi-agents et recherche longue). Chaque monde est déterministe par seed, possède trois niveaux et garde son oracle hors de l'observation publique. Les scores de référence sont propres à chaque type de preuve. Ces mondes restent des environnements synthétiques de calibration, et ne remplacent pas des expériences scientifiques réelles ni des évaluations natives concurrentes.

`adapters/referenceSystems.js` expose des contrôles déterministes de format et un score oracle-aware pour valider le harnais ; ce ne sont pas des systèmes ETT et le contrôle supérieur oracle-aware n'est pas un comparateur de performance. Les cinq modules sous `adapters/independent/` fournissent des adaptations séparées des concurrents au même modèle ; ils reçoivent les observations métier sans accès à l'oracle. Le runner ne transmet pas le secret à l'entrée du runtime GenOS. Les implémentations originales Voyager, AI Scientist v2 et DGM restent déclarées indisponibles dans `configs/systems.yaml`.

Le vérificateur lit le secret uniquement dans `evaluation/oracle_worker.js`, lancé dans un processus Node enfant. Ce cloisonnement réduit la fuite accidentelle dans le harnais local ; ce n'est pas une frontière de sécurité résistante à un opérateur qui contrôle la machine. Le runner conserve le temps hôte et les échecs, mais aucun appel fournisseur ni mesure de tokens/coût n'est fait.

## Campagne scientifique et limites

Le protocole scientifique v2 (`benchmarks/endogenous-thought/protocol-v2.json`) compare `full` à `llm_only` via des providers injectés, un vérificateur indépendant et un mesureur externe. `run_campaign.js` conserve cette intégration. Elle ne fournit pas à elle seule les concurrents ni la matrice A0–A5 complète. Ses contraintes de corpus et son exécution des providers doivent être respectées ; ne remplacez pas les preuves manquantes par des scores nuls.

Les adaptateurs de référence déterministes sont des contrôles de pipeline. Les concurrents Voyager, AI Scientist v2 et DGM restent des proxies, pas leurs exécutables originaux. Le runner runtime peut inclure GenOS, un contrôle direct LLM et les trois adaptateurs concurrents dans un même reçu. Le plafond global de 250 000 tokens ne permet pas les milliers d'exécutions avec les coûts observés au pilote ; il est appliqué sans le dépasser.

La campagne complète reste inachevée tant qu'un corpus holdout scellé, des environnements réalistes, les adaptateurs concurrents fidèles, le contrôle direct, au moins 30 seeds, toutes les ablations et l'audit de replay n'ont pas été obtenus dans le budget. Aucun niveau ETT-L1 à ETT-L5 ni classement scientifique n'est revendiqué.

Le pilote synthétique de développement préexistant est archivé dans [`reports/development-pilot.json`](reports/development-pilot.json) ; il ne constitue pas un résultat de cette campagne. Les statistiques de bootstrap apparié et de correction de Holm sont disponibles dans `evaluation/statistics.js`.
