# ADR 0624 — Cycle de vie révocable de la qualification fondatrice

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : qualification, fraîcheur, révocation, quarantaine
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0613, ADR 0622, ADR 0623

## Contexte

La phase 7 a rendu la note 4 exécutable et liée aux sources, mais son reçu reste
une photographie. Un consommateur qui ne relance pas le gate pourrait continuer
à afficher cette note après une dérive des sources, le vieillissement des preuves
ou l'apparition d'une contre-preuve. La révision de baseline décrit en outre le
socle fonctionnel, pas le point Git depuis lequel la campagne est exécutée.

## Décision

Le manifeste v2 distingue `baselineRevision` de `qualificationRevision`. Cette
dernière est l'ancre Git de la campagne ; le digest des sources référencées ferme
l'état exact évalué au-dessus de cette ancre.

Une politique de cycle de vie fixe :

- un âge maximal des observations et une tolérance d'horloge future ;
- un registre versionné de révocations explicites ;
- une réévaluation obligatoire du reçu, du manifeste et des sources ;
- trois états : `current`, `quarantined` et `revoked`.

Seul `current` conserve une `effectiveScore` de 4. Une preuve périmée, un reçu
altéré, une dérive ou un registre invalide retire la note effective et place la
qualification en quarantaine. Une révocation visant le hash du reçu produit
`revoked`. Aucun de ces états n'autorise une promotion.

Le registre exige un hash de reçu, une autorité textuelle, un motif et une date.
L'autorisation humaine de modifier le registre reste assurée par la gouvernance
Git du dépôt ; ce lot ne prétend pas fournir une signature externe de cette
autorité.

## Conséquences

- La note 4 devient une propriété courante réévaluée, non un badge permanent.
- Une contre-preuve peut révoquer précisément un reçu sans effacer son histoire.
- Chaque exécution du gate renouvelle des observations fraîches.
- Un consommateur doit appeler `assertCurrent` avant d'afficher la note active.
- Le délai de quinze minutes est une politique locale, pas une vérité universelle.

## Preuves exécutables

- `backend/tests/test_foundational_qualification_lifecycle.js` couvre dérive,
  péremption, altération, révocation et refus fail-closed ;
- `backend/tests/test_foundational_principles_qualification.js` relance la suite,
  vérifie le reçu v2 et exige un état courant avec le registre canonique.

## Alternatives écartées

- **Conserver le reçu v1 sans durée de vie** : permet une lecture obsolète.
- **Supprimer un reçu invalidé** : détruit la provenance de la décision passée.
- **Faire de la qualification une autorité de promotion** : confond preuve et
  décision autorisée.
