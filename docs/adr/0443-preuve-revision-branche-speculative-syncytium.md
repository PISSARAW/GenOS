# ADR 0443 — Lier la validation spéculative à la révision de branche

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Syncytium, variant Speculative, promotion

## Contexte

La façade Speculative acceptait un `evidenceGate` positif après une mutation de
branche, même si cette déclaration avait été préparée pour l'état précédent.
L'empreinte des opérations était calculée pour le journal mais non vérifiée
avant la promotion. Le service CRDT pouvait ensuite promouvoir la branche
courante, différente de celle que l'appelant prétendait avoir validée.

## Décision

`listBranches` expose une `validationFingerprint` calculée à partir de
l'identifiant de branche, de sa base et des identifiants d'opérations appliquées.
Une déclaration positive doit porter `branchId` et `branchFingerprint` égaux à
la révision courante. En cas d'écart, la façade refuse avec
`SPEC_EVIDENCE_STALE` et laisse la branche active pour une nouvelle validation.
Le service de coordination compare, sous son verrou de promotion, les
`expectedOperationIds` transmis par la façade aux opérations CRDT réellement
présentes. Il refuse une mutation intervenue entre lecture et promotion avec
`SYNCYTIUM_BRANCH_STALE`.

## Portée et limites

Cette liaison empêche le rejeu involontaire d'une validation sur une révision
différente. Elle ne prouve ni l'identité du vérificateur, ni l'exécution réelle
des contrôles déclarés, ni la validité d'une décision externe. L'opération MCP
bas niveau `promote` reste distincte de la façade et n'exige pas ce gate.
Un protocole de reçus signés ou vérifiés par le runtime serait nécessaire pour
une preuve indépendante. Le test de falsification modifie la branche après la
première empreinte, vérifie le refus, puis valide la nouvelle révision.
