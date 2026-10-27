# OMEGA-BENCH 2026 — préflight de lancement

Date : 2026-10-27 (Europe/Paris)  
Statut : **pilote E03 exécuté; campagne complète bloquée**

## Contrôles effectués

- Le corpus préparé contient 600 cas et un manifeste d'empreintes. Ce sont des données, pas des exécutions de benchmark.
- `adapters/` ne contient aucun exécuteur externe; il contient uniquement le contrat descriptif.
- `src/` contient le générateur, l'évaluateur et un runner de pilote limité à E03; il ne contient pas de runner pour les 12 expériences.
- Les quatre conditions A–D sont des descriptions dans `protocol.json`; elles ne sont pas raccordées à des adaptateurs.
- Les sept familles de référence sont `unconfigured` dans `configs/baselines.json`.
- Les configurations matériel et modèle sont des gabarits sans valeurs, donc les conditions comparables ne sont pas configurées.
- Au contrôle local, les commandes `mlir-opt`, `opa` et `temporal` ne sont pas disponibles. Cela ne préjuge pas des éventuels services distants ni de la possibilité de créer des adaptateurs.

## Décision

Ne pas démarrer les 7 200 exécutions minimales : sans adaptateurs exécutables pour A–D et sans configuration commune de modèle et de matériel, aucune comparaison complète ne serait valide. Un pilote ciblé E03 a été exécuté : AJV 2020-12 contre le service réel d'interopérabilité Omega Node, sur l'enveloppe G-CIR canonique. Les deux conditions ont accepté correctement 150/150 exécutions (50 cas × 3 répétitions). La médiane observée est de 0,0047 ms pour AJV et 0,68075 ms pour Omega Node dans cet environnement. Ce résultat descriptif, sur un seul schéma et sans test statistique, ne prouve pas un avantage général; le pilote n'invoque pas de modèle et ne représente pas les autres expériences.

## Prérequis de reprise

1. Implémenter et qualifier l'exécuteur JSON de référence complet et les adaptateurs G-CIR Ω minimal, optimisé et GenOS complet pour les 12 expériences.
2. Déclarer les versions et capacités des baselines applicables; coder leurs adaptateurs ou marquer les dimensions hors périmètre `N/A`.
3. Remplir et figer le modèle, les paramètres, le matériel, les budgets et la frontière de mesure.
4. Ajouter un runner qui écrit un résultat conforme au schéma par scénario, condition et répétition, avec journaux et traces reproductibles.
5. Préenregistrer les contrastes, les volumes requis par expérience, le jeu caché et le calcul de puissance.

Le pilote a écrit 300 lignes de résultats bruts dans `E03-pilot.jsonl`; son manifeste lie les métriques à la révision `b899c3edde6361ee0dec0e86420884d49ba7f7ca`. Le workspace était marqué modifié par des fichiers non suivis préexistants au moment de l'exécution. Le fichier de protocole indique 7 200 exécutions pour les quatre conditions principales uniquement; baselines externes, ablations et essais de charge s'ajoutent à ce total.
