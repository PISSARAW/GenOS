# OMEGA-BENCH 2026 — préflight de lancement

Date : 2026-10-27 (Europe/Paris)  
Statut : **qualifications A/B et pilote E03 exécutés; campagne complète bloquée**

## Contrôles effectués

- Les conditions A, B et C ont chacune exécuté 8 400 passages sur les 2 800 cas du corpus v0.2.0 et correspondu à l'oracle. B réutilise les handlers déterministes d'A derrière le compilateur et le runtime Omega; C ajoute une validation statique d'enveloppe et une fusion d'additions pour E04. Ces passages qualifient le banc et une optimisation ciblée, pas un gain comparatif de G-CIR Ω.
- `adapters/` ne contient aucun exécuteur externe; il contient uniquement le contrat descriptif.
- A/B/C ont un runner sur les 12 expériences; D n'a pas d'adaptateur.
- Les conditions C et D ne représentent pas encore l'optimisation complète, l'intégration physiologique/morphogénétique ou l'exécution GenOS du protocole.
- Les sept familles de référence sont `unconfigured` dans `configs/baselines.json`.
- Les configurations matériel et modèle sont des gabarits sans valeurs, donc les conditions comparables ne sont pas configurées.
- Au contrôle local, les commandes `mlir-opt`, `opa` et `temporal` ne sont pas disponibles. Cela ne préjuge pas des éventuels services distants ni de la possibilité de créer des adaptateurs.

## Décision

Ne pas démarrer la campagne comparative complète de 33 600 exécutions : D, les baselines, le modèle/matériel communs, le préenregistrement et le holdout manquent. Le pilote E03 compare AJV 2020-12 au service réel d'interopérabilité Omega Node sur l'enveloppe G-CIR canonique. Les deux conditions ont accepté correctement 150/150 exécutions (50 cas × 3 répétitions). Les latences du pilote ne sont pas comparables directement, car AJV compile le schéma avant la mesure et Omega le relit et le revalide par appel. Le pilote n'invoque pas de modèle et ne représente pas les autres expériences.

## Prérequis de reprise

1. Implémenter et qualifier l'exécuteur JSON de référence complet et les adaptateurs G-CIR Ω minimal, optimisé et GenOS complet pour les 12 expériences.
2. Déclarer les versions et capacités des baselines applicables; coder leurs adaptateurs ou marquer les dimensions hors périmètre `N/A`.
3. Remplir et figer le modèle, les paramètres, le matériel, les budgets et la frontière de mesure.
4. Ajouter un runner qui écrit un résultat conforme au schéma par scénario, condition et répétition, avec journaux et traces reproductibles.
5. Préenregistrer les contrastes, les volumes requis par expérience, le jeu caché et le calcul de puissance.

Les conditions A, B et C ont chacune écrit 8 400 lignes; le pilote E03 a écrit 300 lignes. Leurs manifestes tracent les empreintes et révisions. Le workspace contenait des changements non liés, laissés intacts. Le plan à volumes proposés indique 33 600 exécutions pour les quatre conditions principales; baselines externes, ablations et essais de charge s'ajoutent à ce total.

## Contrôle fail-closed de disponibilité

Le premier passage de `python src/check_readiness.py` retournait `blocked` (2 contrôles prêts sur 14). Le corpus public v0.2.0 a été étendu et A/B/C ont été évaluées : 8 400 résultats chacune, 100 % conformes aux oracles, sans doublon, manque ni échec critique. C applique la fusion E04 dans 150 cas sur 150. Le contrôle readiness retourne maintenant `blocked` (7/14). Restent sept contrôles bloquants : aucun holdout scellé; D absent; baselines non configurées; matériel et modèle non verrouillés; protocole non préenregistré avec sept éléments ouverts. Le corpus étendu reste public et synthétique; il ne constitue pas le holdout.

L'inventaire des exécutables, du modèle Ollama et de l'hôte ainsi que les critères de reprise sont détaillés dans [`unblock-assessment-2026-10-27.md`](unblock-assessment-2026-10-27.md). Le modèle local trouvé n'est pas choisi pour la campagne : A/B/C n'effectuent aucun appel modèle, et les mesures de performance ne seraient pas isolées sur l'hôte observé.
