# L'Intégration Multisensorielle (Colliculus Supérieur)

Dans GenOS, l'agent IA ne traite pas ses entrées de manière monolithique. Pour reproduire la rapidité de réaction du vivant face au danger ou aux événements importants, GenOS utilise le concept d'**Intégration Multisensorielle** calqué sur le Colliculus Supérieur (CS) humain. Le code source se trouve dans `crates/genos-core/src/biomimicry/multisensory_integration.rs`.

## 1. Le Système de Navigation Rapide
Le cortex (qui, pour GenOS, correspond au planificateur LLM et à l'arbre MCTS) est l'outil d'analyse profonde. Il est puissant, mais lent.
Le **Colliculus Supérieur (`SuperiorColliculus`)** est le "GPS centralisé et ultra-rapide". Il capte directement les données brutes issues de différentes modalités (les différents "sens" de l'agent). 

Les sens de GenOS :
* **Vision (`Visual`)** : Analyse de structure, AST, interface graphique, lecture de code.
* **Ouïe (`Auditory`)** : Flux de logs, alertes asynchrones, traces d'exécution.
* **Toucher (`Tactile`)** : Pression système, charge CPU, consommation RAM, métriques.

## 2. Le Centre de Fusion et de Coïncidence
Le rôle du CS n'est pas de comprendre la signification sémantique d'un log ou d'un bloc de code. Son algorithme (`process_signals`) recherche uniquement une **coïncidence spatiale et temporelle** :
- **Où ? (`spatial_source`)** : Le log d'erreur indique-t-il la même ressource que l'AST récemment modifié ?
- **Quand ? (`timestamp_ms`)** : Le pic de charge CPU s'est-il produit exactement au moment où l'alerte réseau a retenti ?

## 3. Le Poids Différencié (Weighting et Fusion)
La véritable magie de l'intégration multisensorielle réside dans l'amplification. 
Si le module de fusion perçoit un événement de la *Vision* et un événement de l'*Ouïe* au même moment et au même endroit, l'importance de ce signal n'est pas simplement additionnée. Elle est multipliée (`fusion_multiplier`). Le CS dit alors à l'agent : *"Le mouvement ET le son arrivent au même endroit, nous devons y orienter l'attention !"*

## 4. L'Orientation et le Lien avec la Mémoire (Chemin Synaptique)
Si le signal pondéré dépasse le seuil critique (`activation_threshold`), le système court-circuite le Cortex et génère immédiatement une réponse motrice : `MotorReflex::OrientAttention`.
L'agent abandonne son fil de pensée actuel pour se "tourner" vers le point critique. 

C'est là que le lien avec les **Chemins Synaptiques** est crucial : dans la biologie, ce couplage rapide sensorimoteur crée un pic d'attention maximale. Dans GenOS, la donnée pointée par le Colliculus Supérieur contournera l'habituel filtre d'élagage (pruning) et forcera la création immédiate d'une *Potentialisation à Long Terme (LTP)*, assurant que cet événement convergent ne soit jamais oublié.
