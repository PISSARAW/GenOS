# Évaluation des blocages restants — OMEGA-BENCH 2026

Date : 2026-10-27 (Europe/Paris)  
Révision de données examinée : `9110da6950e18abad18e83029dc01142f0b47ea3`  
Contrôle : `python src/check_readiness.py` — **blocked, 14/21 contrôles**

## État observé

- Le corpus public v0.3.0 comprend 3 400 scénarios. A, B et C ont chacune 10 200 résultats conformes à l'oracle; C ne réalise qu'une fusion ciblée pour E04. Ces 30 600 passages sont des qualifications publiques, pas la campagne comparative complète.
- Aucun adaptateur D n'est présent. Le code de morphogenèse et de physiologie existe dans GenOS, mais il n'est pas raccordé à un runner de benchmark qui exécute les missions et mesure leurs effets.
- Les familles MLIR, Temporal, LangGraph, A2A, MCP et OPA ne sont pas configurées. `mlir-opt`, `temporal` et `opa` ne sont pas dans le PATH; les modules Python `langgraph`, `a2a`, `temporalio` et `opa` sont absents. Une implémentation spécifique et une version par adaptateur restent nécessaires.
- L'hôte expose Windows 11 build 26200, Node 24.18.0, Python 3.12.10, un AMD EPYC 7543P avec 8 processeurs logiques visibles, 30 044 250 112 octets de mémoire et une RTX A4500 de 20 Go. L'utilisation GPU observée était de 18 % et 2 308 MiB; cette machine n'est donc pas isolée pour mesurer des différences de latence ou de coût.
- Ollama est installé. Le modèle local `qwen2.5:14b` est disponible (digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`, Q4_K_M, 14.8B paramètres). A/B/C n'appellent pas de modèle; verrouiller ce modèle maintenant ne rendrait pas les conditions comparables.
- Aucun holdout scellé n'est présent. Le corpus actuel est public et doit rester un jeu de développement.
- Le protocole est un brouillon; sept éléments de préenregistrement restent ouverts. Les résultats A/B/C ont déjà été observés, donc tout préenregistrement ultérieur doit distinguer explicitement les analyses exploratoires des futurs contrastes confirmatoires.

## Pourquoi le gate reste fermé

Le nombre de contrôles readiness passés a augmenté lorsque les adaptateurs C et les volumes d'échantillons ont été ajoutés. Les contrôles restants correspondent à des prérequis de l'expérience, pas à un problème du script de lancement. Créer des fichiers d'adaptateur vides, marquer les baselines applicables `N/A` sans analyse de capacités, ou inclure un holdout dans le dépôt donnerait un faux état prêt.

## Séquence de reprise

1. Construire et exécuter un adaptateur D qui appelle effectivement les services GenOS de morphogenèse et de physiologie sur les tâches applicables; qualifier chaque mesure `N/A` par contrat.
2. Implémenter ou installer les baselines applicables et figer leurs versions; garder le JSON de référence associé à A.
3. Choisir un hôte de mesure isolé et verrouiller runtime, matériel, modèle et paramètres seulement après avoir raccordé les mêmes frontières de mesure aux conditions comparées.
4. Figer les contrastes, marges, analyses et calcul de puissance. Générer ensuite un holdout distinct, dont les entrées ne sont accessibles qu'au runner et dont l'oracle reste réservé à l'évaluateur.
5. Relancer le contrôle readiness; ne lancer le plan confirmatoire que lorsqu'il retourne `ready`.
