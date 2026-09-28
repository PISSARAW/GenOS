# ADR 0171 — Staffing A-Team depuis WorkGraph et apprentissage des topologies

- **Statut** : Accepté
- **Date** : 2026-09-28
- **Domaine** : Orchestration, morphogenèse
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0094, ADR 0133, ADR 0170

## Contexte

L'analyse A-Team fondée uniquement sur le texte d'une mission ne pouvait pas
respecter les dépendances et compétences déjà explicites dans un WorkGraph.
Le résolveur de topologie utilisait par ailleurs un taux historique global,
sans contexte de problème ni preuve persistée attachée aux observations.

## Décision

Quand une entrée contient des exigences explicites ou un WorkGraph valide,
A-Team dérive le staffing des capacités requises, des propriétaires de nœuds et
des dépendances validées. Un graphe invalide bloque la recommandation. Les
budgets déterminent encore si l'équipe peut être activée.

Les résultats morphologiques vérifiés alimentent des observations persistées,
bornées et contextualisées par type de problème et complexité. Le résolveur
mélange ce prior appris avec ses scores heuristiques; le poids appris dépend du
volume d'observations et l'exploration reste bornée. Cet apprentissage ne
constitue ni preuve de qualité ni autorisation de promotion.

La validation causale répliquée rejette les entrées non sérialisables, clone
les bras et l'état pour chaque exécution, puis rapporte un intervalle t apparié
à 95 %. Un effet nul ou incertain reste un reçu `inconclusive`.

## Conséquences

### Positives

- Le staffing peut suivre une structure de travail validée et ses dépendances.
- Les retours vérifiés peuvent infléchir le classement selon le contexte.
- Les observations et les limites statistiques restent inspectables.

### Négatives

- Le fichier d'observations morphologiques demande une gestion locale de
  persistance et peut être indisponible sans empêcher la résolution heuristique.
- L'intervalle t suppose des différences appariées approximativement normales.

## Alternatives

- Conserver uniquement l'analyse A-Team textuelle et les scores statiques :
  rejeté, car les exigences structurées disponibles seraient ignorées.
- Apprendre sans preuve persistée ou remplacer directement les heuristiques :
  rejeté, car cela rendrait le classement opaque et fragile aux petits échantillons.
