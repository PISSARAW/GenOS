# ADR 0426 — Consentement explicite avant l'action Human–AI Syncytium

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Syncytium, Human–AI, autorité humaine
- **Lié à** : [ADR 0414](0414-approbation-liee-a-laction-human-ai-syncytium.md)

## Contexte

Le variant déclarait un consentement explicite, mais `executeApprovedAction`
refusait seulement un retrait enregistré. Sans entrée `human.consent`, une
approbation suffisait à enregistrer l'action. Le champ `scope` était accepté
librement puis ignoré au moment de l'admission.

## Décision

L'admission exige un consentement courant `granted: true` pour l'agent approuvé,
dans la portée `session`. L'absence de consentement, son retrait ou une entrée
héritée sans portée reconnue produisent `SYNCYTIUM_HUMAN_CONSENT_REQUIRED`.
`setHumanConsent` refuse désormais les portées autres que `session`, car aucune
application fiable d'une portée plus étroite n'est implémentée. L'approbation
reste liée à l'action et à l'agent comme dans l'ADR 0414. La transaction
sérialisable vérifie la version de l'état lue avant l'enregistrement : un
retrait concurrent rend l'admission périmée.

## Limites et vérification

Ce consentement autorise l'enregistrement d'une action dans le CRDT. Il ne
prouve ni l'identité physique de l'humain ni un effet externe de l'action.
`test_syncytium_human_ai_variant.js` couvre l'absence, la portée invalide,
le retrait et le rétablissement du consentement, puis l'usage unique de
l'approbation.
