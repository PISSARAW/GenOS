# ADR 0705 — Registre d'adaptateurs de clôture topologique

- **Statut** : Accepté, adaptateurs spécialisés en attente
- **Date** : 2026-10-20
- **Domaine** : orchestration, topologies, clôture, preuves
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0401 à 0408, ADR 0654

## Contexte

Le service de complétion biologique appliquait une même interprétation à toutes les
topologies non-Syncytium. Une barrière de workers complète devenait un invariant
topologique et les références d'oracle portées par chaque preuve worker étaient
agrégées en oracle indépendant de clôture. Cette construction attestait au mieux les
exécutions individuelles ; elle ne relisait ni l'état canonique ni les invariants de
Biocénose, Trinity, A-Team, Rhizome, Biome, Holobionte ou Métapopulation.

Le transport réussi et la présence de reçus workers ne doivent donc pas qualifier seuls
le comportement propre à une topologie. Les lecteurs spécialisés seront raccordés par
lots et doivent pouvoir évoluer sans ajouter leur sémantique au service transversal.

## Décision

Un registre sélectionne un adaptateur de clôture selon l'identifiant de topologie. Un
adaptateur produit un dossier composé de :

- l'identité de mission et le cycle de vie ;
- un roster avec ses membres requis et leurs preuves ;
- la validation topologique ;
- les invariants relus depuis l'état canonique ;
- l'oracle indépendant et ses références ;
- l'état de la barrière de workers.

Le dossier est projeté vers l'entrée de `missionClosureService`, seule porte commune qui
combine les preuves worker, les invariants et l'oracle. Le registre est injectible afin
que les adaptateurs spécialisés puissent être testés sans modifier la sélection globale.

Les sept modes non-Syncytium connus sont enregistrés avec un adaptateur d'attente. Celui-ci
retourne une validation `partial`, aucun invariant qualifié et aucun oracle. Ainsi, une
barrière complète et des preuves workers intactes restent insuffisantes jusqu'au raccord
de l'adaptateur spécialisé. Un mode inconnu et un dossier mal formé échouent également en
mode fermé avec un verdict partiel.

Syncytium ne passe pas par ce registre. Son service existant conserve la validation de
l'état partagé, la réconciliation et la matérialisation décrites par ADR 0654.

## Conséquences

### Positives

- La preuve d'exécution d'un worker ne peut plus être promue implicitement en oracle de
  comportement topologique.
- Chaque topologie dispose d'un point d'extension isolé pour relire son état canonique.
- L'absence d'implémentation spécialisée est observable et produit un verdict partiel.
- Le service transversal ne connaît plus les règles propres aux sept topologies.

### Négatives

- Les missions non-Syncytium ne peuvent pas réussir par ce chemin tant que leur
  adaptateur spécialisé n'est pas raccordé.
- Chaque adaptateur devra maintenir la liaison entre mission, session ou run, preuves,
  invariants et reçu d'oracle.
- L'activation d'un nouvel adaptateur demande des contre-tests spécifiques à sa source
  canonique, au-delà des tests génériques du registre.

## Implémentation et preuves

Le registre et le contrat de dossier résident dans
`backend/src/services/topologyCompletionAdapters/`. Le service
`biologicalMissionCompletionService.js` collecte encore les preuves communes, puis délègue
la construction de l'entrée de clôture au registre. Les tests de complétion couvrent les
sept modes par table, l'insuffisance des références workers, l'injection d'un adaptateur
spécialisé synthétique et le refus d'un dossier mal formé.

Cette tranche ne prétend pas implémenter les sept oracles topologiques. Leur raccord est
une suite explicite de cette décision.

## Alternatives

### Conserver un oracle générique dérivé des workers

Rejeté : cela confond l'attestation d'exécution avec la validation de la décision et de
l'état propres à la topologie.

### Ajouter les sept lecteurs au service transversal

Rejeté : ce service deviendrait dépendant de tous les stores et cycles de vie et violerait
la séparation des responsabilités.

### Autoriser temporairement la barrière workers comme succès

Rejeté : cette compatibilité créerait précisément le faux positif que la porte de clôture
doit empêcher.
