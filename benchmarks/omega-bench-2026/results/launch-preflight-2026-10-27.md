# OMEGA-BENCH 2026 — préflight de lancement

Date : 2026-10-27 (Europe/Paris)  
Statut : **qualifications A/B et pilote E03 exécutés; campagne complète bloquée**

## Contrôles effectués

- Les conditions A et B ont exécuté chacune 1 800 passages sur les 600 cas et correspondu à l'oracle. B réutilise les handlers déterministes d'A derrière le compilateur et le runtime Omega; ces passages qualifient le banc, pas un gain comparatif de G-CIR Ω.
- `adapters/` ne contient aucun exécuteur externe; il contient uniquement le contrat descriptif.
- `src/` contient le générateur, l'évaluateur et un runner de pilote limité à E03; il ne contient pas de runner pour les 12 expériences.
- Les quatre conditions A–D sont des descriptions dans `protocol.json`; elles ne sont pas raccordées à des adaptateurs.
- Les sept familles de référence sont `unconfigured` dans `configs/baselines.json`.
- Les configurations matériel et modèle sont des gabarits sans valeurs, donc les conditions comparables ne sont pas configurées.
- Au contrôle local, les commandes `mlir-opt`, `opa` et `temporal` ne sont pas disponibles. Cela ne préjuge pas des éventuels services distants ni de la possibilité de créer des adaptateurs.

## Décision

Ne pas démarrer les 7 200 exécutions minimales : sans adaptateurs exécutables pour A–D et sans configuration commune de modèle et de matériel, aucune comparaison complète ne serait valide. Le pilote E03 compare AJV 2020-12 au service réel d'interopérabilité Omega Node sur l'enveloppe G-CIR canonique. Les deux conditions ont accepté correctement 150/150 exécutions (50 cas × 3 répétitions). Les latences du pilote ne sont pas comparables directement, car AJV compile le schéma avant la mesure et Omega le relit et le revalide par appel. Le pilote n'invoque pas de modèle et ne représente pas les autres expériences.

## Prérequis de reprise

1. Implémenter et qualifier l'exécuteur JSON de référence complet et les adaptateurs G-CIR Ω minimal, optimisé et GenOS complet pour les 12 expériences.
2. Déclarer les versions et capacités des baselines applicables; coder leurs adaptateurs ou marquer les dimensions hors périmètre `N/A`.
3. Remplir et figer le modèle, les paramètres, le matériel, les budgets et la frontière de mesure.
4. Ajouter un runner qui écrit un résultat conforme au schéma par scénario, condition et répétition, avec journaux et traces reproductibles.
5. Préenregistrer les contrastes, les volumes requis par expérience, le jeu caché et le calcul de puissance.

Les conditions A et B ont écrit chacune 1 800 lignes dans `A-reference.jsonl` et `B-gcir-minimal.jsonl`; le pilote E03 a écrit 300 lignes dans `E03-pilot.jsonl`. Leurs manifestes tracent les empreintes et révisions. Le workspace était marqué modifié par des fichiers non suivis préexistants au moment des exécutions. Le fichier de protocole indique 7 200 exécutions pour les quatre conditions principales uniquement; baselines externes, ablations et essais de charge s'ajoutent à ce total.
