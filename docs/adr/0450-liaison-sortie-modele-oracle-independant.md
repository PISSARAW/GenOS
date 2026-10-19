# ADR 0450 — Lier la sortie du modèle au résultat de l'oracle

- **Statut** : Accepté pour le refus fermé et le domaine `model_subset_sum` ; domaines modèles additionnels à venir.
- **Date** : 2026-10-12.
- **Lié à** : [ADR 0445](0445-pont-preuve-mission-vers-apprentissage-routeur.md), [ADR 0448](0448-observation-couts-modele-dans-recu-worker.md).

## Contexte

Le pont vers le bandit rapprochait une tentative modèle mesurée et un oracle
natif dans le même run. L'oracle `subset_sum` existant vérifie le résultat d'une
procédure déterministe. Il ne vérifie pas le texte rendu par le modèle. Même si
les dépenses, le run et l'action concordent, attribuer ce succès au modèle
serait une substitution de preuve.

## Décision

L'observation du retour modèle conserve l'empreinte SHA-256 du texte UTF-8 brut
effectivement reçu, dans l'événement de coût scellé avant le rapport de preuve.
Le pont exige une unique observation avant `EVIDENCE_REPORT`, attribuée à la
tentative, à l'action et au run. Il n'admet pour l'apprentissage qu'un résultat
AEIS du domaine dédié `model_subset_sum` dont le contenu de preuve porte
`genos.model-oracle-output/v1`, la même empreinte et les mêmes identifiants.
Les autres domaines, les sorties sans texte et les liaisons absentes sont
refusés.

Cette condition est supplémentaire à la preuve native historique, au quorum
indépendant, à la validité courante de l'assemblage, au contrat d'issue et à la
concordance comptable déjà exigés. L'empreinte seule ne certifie pas la réponse :
le futur domaine devra relire le texte effectivement observé et le soumettre
à deux stratégies de vérification indépendantes avant de signer le claim.

## Limite actuelle

Le domaine `model_subset_sum` est implémenté par
`backend/src/services/epistemic/oracleModelSubject.js` et enregistré dans
`nativeOracleDomains.js`. Il relit le texte effectivement observé, le lie à
l'empreinte, au run et à la tentative, et le soumet aux vérifications
indépendantes avant de signer le claim. La voie modèle non nulle → oracle
indépendant → apprentissage est donc ouverte pour ce seul domaine, sous
budget modèle explicite.

`test_route_model_causal_binding.js` vérifie les mutations de l'empreinte et
des identifiants ; `test_route_mission_outcome_bridge.js` maintient le refus
d'un run natif sans réponse modèle observée ; `test_model_oracle_route_e2e.js`
couvre désormais le bout en bout, domaine d'oracle dédié inclus.
