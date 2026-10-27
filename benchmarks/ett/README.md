# ETT-BENCH 2026 — campagne expérimentale

**Statut :** un harnais de référence local exécute les 12 scénarios sur 3 difficultés, avec 8 politiques déterministes et un oracle séparé en processus enfant. C'est une preuve d'exécution du harnais, pas une qualification scientifique des systèmes ETT ou concurrents.

## Exécuter le harnais de référence

```powershell
node benchmarks/ett/run_reference_campaign.js --seeds 30 --output benchmarks/ett/reports/reference-run.json
```

Le fichier de sortie doit être nouveau : le runner refuse de l'écraser. Pour une exécution de développement plus courte, remplacer `30` par `1`. Chaque seed génère une instance pour chacune des 36 paires scénario/difficulté. Les échecs restent dans le dénominateur. Les réponses sont vérifiées dans un processus distinct et le reçu précise `scientificClaimAllowed: false` et `externalModelCostsMeasured: false`.

## Portée des scénarios et adaptateurs

`scenarios/runtime.js` fournit le générateur déterministe et les schémas de propositions. Les 12 manifestes déclarent `executable_reference_proxy`. Le monde de référence est une tâche synthétique de choix de candidat à partir d'indices : il teste le chemin d'exécution et la séparation producteur/oracle, mais ne reproduit pas encore douze environnements aux dynamiques distinctes. Les seuils du protocole initial ne sont donc pas évalués par ce proxy.

`adapters/referenceSystems.js` expose GenOS ETT proxy, deux ablations de référence, ReAct classique, boucle périodique et des proxies adaptés de Voyager, AI Scientist v2 et Darwin Gödel Machine. Ces politiques sont des baselines déterministes locales, explicitement pas les systèmes originaux, ni des LLM. Les implémentations originales sont déclarées indisponibles dans `configs/systems.yaml`.

Le vérificateur lit le secret uniquement dans `evaluation/oracle_worker.js`, lancé dans un processus Node enfant. Ce cloisonnement réduit la fuite accidentelle dans le harnais local ; ce n'est pas une frontière de sécurité résistante à un opérateur qui contrôle la machine. Le runner conserve le temps hôte et les échecs, mais aucun appel fournisseur ni mesure de tokens/coût n'est fait.

## Campagne scientifique et limites

Le protocole scientifique v2 (`benchmarks/endogenous-thought/protocol-v2.json`) compare `full` à `llm_only` via des providers injectés, un vérificateur indépendant et un mesureur externe. `run_campaign.js` conserve cette intégration. Elle ne fournit pas à elle seule les concurrents ni la matrice A0–A5 complète. Ses contraintes de corpus et son exécution des providers doivent être respectées ; ne remplacez pas les preuves manquantes par des scores nuls.

Pour qualifier les systèmes réels, il faut encore des environnements spécifiques à chaque capacité, des adaptateurs vérifiés vers les systèmes d'origine ou des adaptations publiées, un modèle figé commun, des budgets appariés, un mesureur fournisseur indépendant et un holdout protégé. Le harnais de référence actuel ne permet aucune revendication ETT-L1 à ETT-L5, aucun classement scientifique ni décision de promotion.

Le pilote synthétique de développement préexistant est archivé dans [`reports/development-pilot.json`](reports/development-pilot.json) ; il ne constitue pas un résultat de cette campagne. Les statistiques de bootstrap apparié et de correction de Holm sont disponibles dans `evaluation/statistics.js`.
