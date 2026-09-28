# Phase 2.1 — Contrats de capacite et plans d'autonomie

## Regle de liaison

Chaque capacite declaree relie : exigence → point d'entree → worker
compatible → outil autorise (lease) → effet attendu sur la decision.
Un plan est **refuse** si une capacite requise est absente ou si le worker
ne la satisfait pas. Le resultat de mission emet un **recu de contrat** :
capacites requises, disponibles, decisions de selection, refus, version
du contrat. Les capacites presentes dans le profil d'une topologie mais
jamais invoquees restent distinguees des capacites exercees.

## Niveaux de preuve (rappel contrat Phase 0 concurrent)

`code-present` (bibliotheque / a_classer) → `branche-runtime`
(experimental minimum) → `valide` (nominal + refus + recu persiste) →
`annoncable` (matrice + docs + exemples a jour). Aucun passage a `actif`
sur presence, score ou transport reussi seuls.

## Recu de contrat minimal

`{ contratVersion, missionId, requises[], disponibles[], selection[],
refus[{capacite, motif}], effetSurDecision, preuve }`.
Motifs de refus fermes : capacite absente, worker incompatible, preuve
absente, provenance invalide, budget depasse. Un echec worker, timeout
ou effet externe ambigu reste visible (jamais de fausse reussite).

## Premiere application

Parcours prioritaire Phase 3.1 (reparation par findings) : le runner
controle n'est declenche qu'apres transition eligible, avec idempotence,
deux snapshots, hashes et provenance. Le recu joint les etapes
reparation → verification → gouvernance.
Les topologies (Phase 4) consomment les memes contrats avant toute
revendication d'autonomie.
