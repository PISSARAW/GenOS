# ADR 0272 — Découverte de dépendances et récupération Self-Twin

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : Self-Twin, causalité, récupération, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0269, ADR 0271

## Contexte

Une erreur de prédiction peut signaler une panne ou une dépendance absente du modèle.
Le Self-Twin doit explorer ces possibilités sans appliquer une réparation dans le
runtime réel et sans traiter une nouvelle arête comme un fait causal.

## Décision

Le diagnostic génère des hypothèses de dépendance à partir des composants connus et
peut proposer un intermédiaire latent quand aucune dépendance apprise n'explique la
cible. Ces arêtes restent au statut `hypothesis` avec faible confiance. Le planificateur
borne le nombre d'interventions et exige une comparaison contrôlée isolée.

Le service de récupération délègue toute exécution à un adaptateur explicitement
relié à une nursery. Chaque résultat doit être terminé et citer des reçus. Le service
ne modifie pas le runtime, conserve `promotionAllowed: false` et requiert une revue
indépendante avant toute décision ultérieure.

## Conséquences

### Positives

- Une panne inconnue peut déclencher une recherche d'intermédiaire plutôt qu'une
  attribution forcée à une arête connue.
- Les propositions de réparation restent bornées, isolées et traçables.
- Les sorties causales gardent un statut d'hypothèse jusqu'aux interventions répétées.

### Limites

- Le service n'exécute pas lui-même les interventions : un adaptateur d'environnement
  et une nursery sont nécessaires.
- Il ne constitue pas encore un benchmark de dommage Lipson ni une récupération
  matérielle démontrée.

## Alternatives

- Réparer automatiquement le composant le plus corrélé : rejeté, faute de preuve
  causale et de garanties d'isolation.
- Élever une arête latente au rang causal dès une expérience : rejeté, car une
  intervention isolée ne suffit pas à établir une dépendance robuste.
