# ADR 0433 — Apprentissage du routeur sur verdicts AEIS persistés

- **Statut** : Accepté pour le raccord local ; qualification de production ouverte.
- **Date** : 2026-10-11.
- **Domaine** : Routage de modèles, apprentissage, canary et mesure.
- **Lié à** : [ADR 0383](0383-economie-tokens-conditionnee-aux-preuves.md).

## Contexte

Le bandit acceptait un objet fourni par l'appelant portant seulement
`status: verified`, `success` et `evidenceRef`. Le même objet pouvait servir
de label aux lignes du registre d'utilisation. La présence d'une référence ne
prouvait ni l'autorité du vérificateur ni la liaison au résultat de la mission.

## Décision

`observe` exige désormais l'identifiant d'une assembly AEIS persistée. Le
magasin vérifie son scellement et son absence de rétractation. Le routeur
recalcule l'éligibilité de l'assembly avec le registre de confiance courant et
vérifie qu'elle porte le même `missionId` et `scopeId` que l'observation.

Un résultat formel de l'assembly doit porter exactement la déclaration canonique
`genos.model-route-outcome/v1` contenant `missionId`, `routeAttemptId`,
`routeUri` et le booléen `success`. Deux reçus indépendants avec des nonces
distincts doivent signer l'identifiant et l'empreinte de preuve de ce résultat.
Une assembly ou une tentative déjà observée ne peut pas entraîner à nouveau le
bandit. Le nouvel état `routing_bandit_verified_v3` ne reprend aucun label des
états antérieurs.

Le registre d'utilisation du fournisseur demeure une source de coût, pas une
source de vérité sur l'issue. Le holdout et l'expérience canary lisent les
observations du bandit, revalident chaque assembly et séparent les missions
entre entraînement et réserve. Une preuve rétractée ferme l'expérience figée.
Le canary est fermé sans expérience qualifiée et son taux implicite vaut zéro.

## Limites

Le producteur de verdicts de mission doit créer une assembly AEIS conforme à ce
contrat avant d'appeler `observe` ; aucun succès de transport n'appelle
automatiquement cette API. Le banc local utilise des preuves synthétiques
signées par le vérificateur de test. Il valide le raccord et le refus des
falsifications, mais ne démontre ni un gain de tokens ni une amélioration de
qualité en production. Les observations récentes retenues pour la calibration
sont limitées à 500 ; les identifiants déjà appris restent dans l'état pour
refuser le rejeu. Les reçus AEIS dépendent de la protection de la clé de
signature et du contrôle des écritures dans le magasin.

## Vérification

`node benchmarks/token-economy/test-verified-bandit.cjs` exerce l'acceptation
d'une assembly scellée, le refus d'un label auto-déclaré, de mutations de
mission, de tentative, de route ou de verdict, d'une signature altérée et
d'un rejeu. Il mesure aussi une calibration sur missions tenues à l'écart sans
revendiquer de gain.

`node backend/tests/test_verified_token_economy.js` et
`node backend/tests/test_organ_ablation_bench.js` conservent leurs régressions
en employant des reçus AEIS de fixture.
