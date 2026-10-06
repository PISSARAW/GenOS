# ADR 0337 - Estimation causale exploratoire des interventions SHEV

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : SHEV, attribution des effets

## Décision

Utiliser DoWhy comme sonde expérimentale lorsque les observations incluent
une intervention, un résultat et le trafic susceptible de les confondre.
Le modèle causal, l'identification, l'estimation et un test placebo sont
explicites. Le résultat reste exploratoire et ne franchit aucun gate de
promotion GenOS.

## Limites

Une bonne estimation sur données synthétiques ne vérifie pas l'absence de
facteurs confondants réels. La collecte longitudinale et la validation du
graphe restent nécessaires avant tout jugement produit.
