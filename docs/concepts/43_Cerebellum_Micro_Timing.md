# Le Cervelet et le Micro-Timing (Contrôle Qualité)

Si le Cortex de GenOS (l'agent planificateur LLM) gère la **stratégie** ("Pourquoi" et "Quoi"), le Cervelet gère la **tactique millimétrée** ("Comment, sans dériver").

Cette architecture, définie dans `crates/genos-core/src/biomimicry/cerebellum.rs`, agit comme un co-processeur délégué. 

## 1. L'Entrée Massive (La Surveillance)
L'agent MCTS envoie un objectif quantifié au système : la `CorticalIntention`. 
Cette intention contient deux métriques :
* Une **valeur cible** (`target_value`)
* Une **latence attendue** (`expected_latency_ms`)

Pendant ce temps, les outils d'exécution remontent un feedback sensoriel (`SensoryFeedback`) continu.

## 2. Le Calcul de l'Erreur (Le Décalage Temporel)
Le module `CerebellumCoprocessor` compare ces deux flux en temps réel avec un coût computationnel quasi nul :
* `value_error` = Différence entre la valeur attendue et constatée.
* `timing_error` = Retard ou avance d'exécution ($\Delta t$).

## 3. L'Ajustement Moteur (Cruise Control)
Plutôt que d'interrompre l'agent LLM à chaque milliseconde pour lui demander de corriger la trajectoire (ce qui serait absurde et brûlerait le budget de l'agent), le Cervelet calcule une `MotorCorrection` proportionnelle à l'erreur (modulée par un `learning_rate` et contenue hors d'une `tolerance_margin`). 

C'est lui qui maintient le "Cruise Control" : le planificateur LLM lance l'ordre "Pousse ce bloc de code" et peut penser à autre chose, tandis que le cervelet s'assure que la requête respecte les quotas de l'API et ajuste le timing asynchrone sans jamais déranger le cortex.
