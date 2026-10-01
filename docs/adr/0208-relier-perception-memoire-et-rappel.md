# ADR 0208 — Relier perception, mémoire et rappel

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Perception, mémoire autobiographique, apprentissage
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0182, ADR 0206

## Contexte

Le runtime persistait déjà des épisodes et consolidait des leçons pour le rappel
pré-planification. Les retours des outils de perception restaient toutefois dans leur
transport et les observations canoniques alimentaient seulement un sensorium volatile
lorsqu'un appelant les y enregistrait explicitement.

## Décision

Après le succès d'un outil navigateur, fovéation, foraging ou contrôle bureau, le backend
crée une observation canonique bornée, l'inscrit dans le sensorium de l'agent et émet un
événement `PERCEPTION_OBSERVED`. La capture autobiographique enregistre les observations
dont le gain d'information atteint le seuil de saillance. Le rappel inclut un résumé
échappé de ces observations, de sorte que les plans ultérieurs puissent réutiliser cette
expérience avec sa provenance.

Une perception porte l'issue `observed`, jamais `success` par défaut. Seuls des résultats
d'action évalués par leurs propres événements et preuves peuvent soutenir une leçon de
réussite ou d'échec. Le sensorium reste local au processus; l'épisode autobiographique
persisté est la mémoire durable.

## Conséquences

### Positives

- Les observations provenant d'outils réels traversent le sensorium et la mémoire
  autobiographique, puis peuvent être rappelées avant une planification ultérieure.
- Les données mémorisées sont résumées et bornées; les images brutes ne sont pas copiées
  dans les épisodes.
- Une perception sans résultat évalué ne devient pas une leçon de réussite ou d'échec.

### Négatives

- Les capteurs en dehors des quatre outils intégrés ne sont pas encore branchés à ce
  bridge.
- Une observation rappelée est une trace historique, pas une preuve de sa validité
  actuelle.
- Le stockage en mémoire vive du sensorium ne survit pas au redémarrage du processus.

## Alternatives

- Persister chaque appel d'outil : rejeté, car les appels sans nouveauté ne méritent pas
  automatiquement un épisode durable.
- Considérer chaque observation réussie comme un apprentissage positif : rejeté, car
  l'observation seule ne mesure pas le résultat de l'action.
