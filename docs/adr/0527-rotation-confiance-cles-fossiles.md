# ADR 0527 — Rotation de confiance des clés de fossilisation

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Fossilisation, provenance, confiance backend/CLI
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0521 — Attester la provenance des fossiles

## Contexte

Les attestations Ed25519 v1 portent un `key_id` dérivé de l'empreinte SPKI de
la clé publique. Le backend signe avec une seule clé active; le CLI choisit
une clé publique dans le bundle de confiance opérateur. La version 1 permet
un chevauchement des clés durant leur rotation, sans modifier les attestations
déjà conservées.

Le contrôle initial faisait confiance à l'association du bundle sans recalculer
que le `key_id` désigne effectivement la clé encodée. Un bundle mal étiqueté
pouvait donc transformer un identifiant de clé en alias.

## Décision

- Le backend et le CLI recalculent le `key_id` à partir de la clé publique et
  refusent une entrée de confiance dont l'identifiant ne correspond pas à
  l'empreinte attendue. La forme de l'attestation v1 ne change pas.
- Pour tourner de la clé A vers B, l'opérateur active B au backend et fournit
  temporairement A et B dans le bundle du CLI. Les anciennes attestations
  restent signées par A; les nouveaux fossiles sont signés par B.
- Après le chevauchement, retirer A du bundle révoque la vérification des
  fossiles signés par A. Le backend ne réécrit ni ne resignera ces attestations.
- `fossil excavate` et `fossil decode` vérifient le fossile demandé. `fossil
  strata` échoue si son corpus contient un signataire absent du bundle.
  `fossil list` conserve ces fossiles visibles pour l'inventaire, les marque
  `signer_not_trusted` et renvoie `verification_complete: false`; ce résultat
  partiel ne vaut jamais preuve d'authenticité.

## Conséquences

### Positives

- Une rotation garde les anciennes signatures vérifiables tant que leurs clés
  restent approuvées; les nouvelles signatures sont vérifiées avec B.
- Le `key_id` ne peut plus être utilisé comme alias vers une clé différente.
- Retirer A n'empêche pas l'excavation ciblée d'un fossile signé par B, même si
  l'archive locale contient encore des fossiles historiques signés par A.
- L'inventaire conserve les fossiles historiques visibles et signale
  explicitement quand le corpus n'est pas entièrement approuvé.

### Négatives

- Après retrait de A, les fossiles A ne sont plus authentifiés par le CLI. Pour
  les vérifier à nouveau, l'opérateur doit réapprouver A ou les conserver dans
  une archive distincte; les données et signatures originales restent intactes.
- L'opération de strates échoue tant qu'un fossile du corpus utilise une clé
  retirée ou inconnue; le listing reste disponible, mais incomplet du point
  de vue de la vérification.

## Alternatives

- Resigner automatiquement les fossiles historiques avec B : rejeté, car cela
  remplacerait leur preuve d'origine par une signature postérieure et
  effacerait l'identité du producteur historique.
- Supprimer silencieusement les fossiles dont la clé est retirée : rejeté, car
  l'archive et ses limites de confiance doivent rester visibles.
