# ADR 0450 — Lier la sortie du modèle au résultat de l'oracle

- **Statut** : Accepté pour le refus fermé ; domaine modèle encore absent.
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

Le domaine `model_subset_sum` n'est pas encore implémenté. Les workers natifs
conservent leur plafond de zéro token modèle. La voie modèle non nulle →
oracle indépendant → apprentissage reste fermée. Aucun assemblage AEIS ni reçu
de succès n'est simulé pour franchir cette frontière.

`test_route_model_causal_binding.js` vérifie les mutations de l'empreinte et
des identifiants ; `test_route_mission_outcome_bridge.js` maintient le refus
d'un run natif sans réponse modèle observée. Un test positif bout en bout
nécessitera le domaine d'oracle dédié et un worker avec budget modèle explicite.
