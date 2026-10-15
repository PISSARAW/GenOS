# ADR 0524 — Préserver la provenance lors de la consolidation mémoire

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Mémoire, consolidation, preuves, provenance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0019 — Socle épistémique du savoir ; ADR 0030 — Immunité épistémique et composition de résultats

## Contexte

La consolidation transforme un épisode en connaissance sémantique, procédure ou
connaissance négative. La politique de promotion ne gardait pas les références
de preuve et de contre-exemple pour les entrées sémantiques et négatives. Le
compilateur de contexte pouvait exposer la provenance reçue, mais ne pouvait pas
reconstruire les liens perdus pendant la promotion. Une connaissance rappelée
risquait ainsi d'être séparée de son applicabilité et des éléments qui l'étayent
ou la réfutent.

## Décision

Toute promotion conserve l'applicabilité, les références d'évidence et les
références de contre-exemple. Le bloc de provenance conserve l'identifiant de
l'épisode initial, les références sources héritées et l'heure de promotion.
Les références de preuve sont limitées aux chaînes non vides et dédupliquées.
Le compilateur de mémoire transmet ces informations dans les éléments et le
tableau de provenance du contexte.

Ces références assurent une chaîne de traçabilité, sans conférer aux éléments
référencés un statut de preuve vérifiée. Leur validation reste du ressort des
gates et autorités propres à chaque type de preuve.

## Conséquences

### Positives

- Les mémoires sémantiques, procédurales et négatives restent reliées aux épisodes, preuves et contre-exemples sources.
- Les composants de rappel peuvent composer les mémoires sans effacer leur contexte d'applicabilité.
- Le test de consolidation vérifie les formes sémantique et négative ainsi que la transmission au compilateur.

### Négatives

- Les entrées promues contiennent davantage de métadonnées et peuvent accroître le coût de stockage et de contexte.
- Les consommateurs doivent traiter ces références comme de la provenance, et non comme une validation implicite.

## Alternatives

- Ne conserver que `sourceEpisodeId` : rejeté, car il ne conserve pas les liens vers les preuves et contre-exemples déjà connus.
- Copier la provenance complète sans filtrer ni dédupliquer : rejeté, car des valeurs vides ou répétées dégradent la chaîne sans apporter d'information.
