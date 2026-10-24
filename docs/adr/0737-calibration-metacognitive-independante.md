# ADR 0737 — Calibration métacognitive indépendante et preuves locales vérifiables

- **Date** : 2026-10-24
- **Statut** : Accepté

## Contexte

Le banc calculait sa confiance et sa cible depuis `predictionError` des mêmes
attributions CoreSelf. Douze prévisions à 0,8 dont seulement six réussissent
pouvaient donc sembler parfaitement calibrées. Le Brier correct est 0,34,
l'ECE 0,30 et l'AUC type-2 0,50. Les anciens chiffres ne constituent pas une
validation de métacognition.

La campagne AGOW du 6 octobre disposait d'un protocole et de résultats décrits,
mais ses artefacts générés devaient être recréés et vérifiés sur les sources
actuelles. Une nouvelle exécution sur petit modèle local doit conserver ses
échecs et sa portée exacte, sans devenir une validation officielle SAD/MIRROR.

## Décision

1. Conserver chaque probabilité immuable lorsque le run est encore `planned`.
   Le stockage lie run, agent, organisation, projet, date et empreinte.
2. Accepter uniquement une résolution liée à ce périmètre, portant un reçu signé
   d'un vérificateur de confiance indépendant. Le reçu doit être postérieur au
   prior et antérieur à l'observation. Les échecs exigent en plus la liaison
   signée à l'événement terminal négatif existant.
3. Exclure les anciennes attributions des métriques ; rendre les absences et
   preuves invalides visibles. Sous dix issues résolues, remplacer le rapport
   appris par `insufficient_data`. Les consommateurs exigent `policyVersion: 2`.
4. Vérifier les archives AGOW par sources, dépendances, protocoles, corpus,
   couverture appariée et recalcul des agrégats. Les mêmes seeds historiques
   constituent une reproduction locale, sans réplication indépendante.
5. Ajouter un pilote Ollama borné : prior, persistance, réponse, oracle exact
   séparé, résolution signée. Le manifeste précède les observations. Le rapport
   garde la couverture complète et interdit la promotion. Sa signature Ed25519
   est vérifiable avec une empreinte externe épinglée ; sa clé incluse ne
   certifie pas une autorité scientifique externe.

## Conséquences

Les résultats peuvent maintenant révéler une mauvaise calibration. Le circuit
runtime continue lorsqu'une mesure facultative manque et ne fabrique pas de
succès. Les gates de preuve et de promotion existantes conservent leur rôle.

Le prior opérationnel n'est pas nécessairement une confiance verbale du modèle.
Le pilote local mesure celle du petit modèle sélectionné, séparément. Le corpus
généré est très petit et comporte des répétitions logiques ; ses seeds réservées
ne garantissent pas des stimuli sémantiquement disjoints du développement.

Ni ces métriques, ni les ablations locales, ni le rappel inspiré de Tsao ne
prouvent une expérience subjective. Voir la [qualification datée](../06-qualite-preuves/qualification-metacognition-agow-2026-10-24.md).

## Alternatives

- Réutiliser `1 - predictionError` comme vérité : rejeté, cible circulaire.
- Assimiler un run `completed` à une réussite indépendante : rejeté, transport
  et décision valide ont des exigences différentes.
- Remplir les issues inconnues par zéro : rejeté, biais et faux échecs.
- Présenter le pilote comme SAD/MIRROR : rejeté, corpus et protocoles distincts.
- Exporter la clé HMAC de l'évaluation : rejeté ; conserver plutôt une archive
  intègre dont la limite d'authentification hors ligne est explicite.
