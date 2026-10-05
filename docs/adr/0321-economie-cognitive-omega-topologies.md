# ADR 0321 — Économie cognitive Omega et topologies

- Statut : Accepté
- Date : 2026-10-05
- Domaine : G-CIR Omega, topologies, budgets cognitifs, routage
- Décideurs : Équipe GenOS

## Contexte

Omega compilait les appels modèle, mais le choix de profondeur, de topologie et
de coût restait dispersé dans les intégrations. Les tokens, la latence et le
risque n'étaient pas réunis dans une décision vérifiable.

## Décision

`cognitiveEconomyControllerService` devient la politique commune du routeur
Omega. Il connaît les huit topologies canoniques, mappe AGOW, Morphogenèse, RPE
et Natural Search vers leurs profils, calcule L0–L5 selon le risque observé et
classe les options par ROI tokens/latence/risque. Le plan est attaché au contrat
Omega et peut être persisté comme observation empirique.

## Invariants

1. Un risque élevé ne peut être abaissé par un niveau demandé plus faible.
2. Une topologie inconnue retombe sur le profil explicite runtime, jamais sur une permission implicite.
3. Le ROI mesure une économie ; il ne remplace ni `CHECK`, ni AEIS, ni une preuve.
4. Les métriques non observées ne sont pas inventées ; leur absence conserve une sélection prudente.
5. Le routeur conserve les gates d'autorité, de budget et de vérification Omega.
