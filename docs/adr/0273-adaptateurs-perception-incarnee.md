# ADR 0273 — Adaptateurs de perception incarnée

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : Perception multimodale, AGOW, environnement
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0269, ADR 0271

## Contexte

Le benchmark Araya requiert des entrées multimodales typées, une liaison entre
modalités et des résultats d'action observables. Le runtime ne doit pas copier des
blobs image/audio dans l'état de travail, et une sortie de transport seule ne prouve
pas la réussite d'une action.

## Décision

Les flux de perception sont normalisés en références d'artefacts, résumés sémantiques
compacts, confiance et incertitude. L'adaptateur de liaison émet des items typés et un
hash de liaison multimodale. L'adaptateur moteur délègue l'action à un environnement
injecté; une action irréversible reste bloquée sans approbation. Une exécution réussie
doit rapporter des reçus de preuve avant d'être retournée comme terminée.

## Conséquences

### Positives

- Les frames de travail peuvent conserver des références et des résumés sans porter
  les flux multimodaux lourds.
- Le contrat de moteur sépare l'intention d'action, l'environnement et les preuves de
  l'état observé.

### Limites

- Aucun environnement SoundSpaces/SAVi, encodeur audio/vision ou modèle de contrôle
  n'est inclus dans cette étape.
- Ces adaptateurs établissent une frontière d'intégration, pas une performance
  incarnée ni une reproduction des expériences Araya.

## Alternatives

- Placer les blobs multimodaux bruts dans le workspace : rejeté, à cause de leur taille
  et de la confusion entre contenu d'artefact et contexte de travail.
- Considérer l'appel moteur réussi sans reçu comme une action réussie : rejeté, car le
  transport ne vérifie pas l'effet sur l'environnement.
