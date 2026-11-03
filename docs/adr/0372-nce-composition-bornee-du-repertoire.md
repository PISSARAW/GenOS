# ADR 0372 — NCE : composition bornée du répertoire appris

- **Statut** : Accepté
- **Date** : 2026-11-02
- **Domaine** : NCE, recherche procédurale, filiation et preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0323](0323-nce-procedures-et-preuves-executables.md)

## Contexte

Le cycle natif conserve les procédures promues dans `proceduralRepertoire`, mais
sa recherche Play utilise uniquement six programmes prédéfinis. Un répertoire
persistant ne suffit donc pas à produire une recherche cumulative.

## Décision

Ajouter un générateur déterministe séparé, alimenté exclusivement par les entrées
du répertoire liées à un reçu local mesuré et promu. Il propose la réutilisation,
la concaténation ordonnée de deux parents distincts, puis des mutations par ajout
ou suppression d'une opération. Le vocabulaire fermé et la limite de 16 étapes
restent ceux de `genos.nce.procedure.v1`.

Limiter les parents à huit et les candidats supplémentaires à seize par défaut,
avec plafonds configurables de seize parents et trente-deux candidats. La limite
globale existante de trente-deux artefacts demeure applicable. Les doublons sont
éliminés par empreinte. Play désactivé interdit ces propositions ; un budget de
zéro désactive seulement l'extension du répertoire.

Chaque proposition conserve les empreintes et références de preuve des parents,
le type de dérivation et l'édition éventuelle. Le reçu conserve le manifeste des
candidats. La dérivation gagnante est persistée et transmise avec la procédure.
Cette filiation atteste la construction ; elle ne prouve pas une amélioration.

Construire les propositions après le contrôle de replay : le répertoire enrichi
par une promotion ne doit pas modifier l'identité de sa requête initiale. Le
contrat de recherche est versionné et fait partie de l'empreinte des nouvelles
requêtes. Les reçus historiques sans contrat de recherche restent rejouables
avec leur empreinte historique et sans configuration de recherche explicite.

Conserver la sélection sur training, le gel avant held-out, la comparaison à la
procédure initiale et la sauvegarde atomique existants. Ajouter les familles
`descending` et `unique-descending` avec un vérificateur protégé pour observer
une composition absente du catalogue initial, puis sa transmission et sa reprise.

## Conséquences

La recherche réutilise des acquisitions vérifiées sans exécuter de code arbitraire.
Ses bornes, son ordre déterministe et les candidats écartés par déduplication
limitent la couverture. La concaténation n'élimine pas les redondances sémantiques.
Les coûts augmentent avec les candidats évalués ; les budgets comptent des
candidats et ne représentent pas un délai global.

Ce lot ne fournit ni curriculum adaptatif, ni garantie de conservation des
performances sur toutes les anciennes tâches, ni validation scientifique générale.

## Alternatives

- Élargir uniquement le catalogue fixe : ne réutilise pas les acquis de l'agent.
- Exécuter du code généré : autorité et surface d'exécution inutiles pour ce lot.
- Composer des entrées sans reçu de promotion : confond proposition et compétence.
