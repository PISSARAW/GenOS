# ADR 0431 — Horloge du runtime pour les baux Syncytium

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Syncytium, Hard, Human–AI, baux
- **Lié à** : [ADR 0426](0426-consentement-explicite-human-ai-syncytium.md)

## Contexte

Les opérations des variants Hard et Human–AI acceptaient `request.now` comme
heure de référence. Un appelant pouvait présenter une heure future pour
acquérir ou récupérer un bail avant son expiration réelle, ou repousser
artificiellement une nouvelle échéance. Le contrôle de transaction Hard
utilisait déjà l'horloge du runtime, mais l'acquisition et la récupération
restaient incohérentes avec ce contrôle.

## Décision

Le runtime calcule l'heure à chaque opération de bail Hard et à l'acquisition
Human–AI. Ces opérations refusent désormais explicitement le champ `now` fourni
par l'appelant. La durée reste bornée par les validations existantes et les
préconditions de version d'état demeurent nécessaires.

## Limites et vérification

Cette mesure retire le contrôle direct de l'heure à l'appelant. Elle ne garantit
pas une horloge physique synchronisée entre plusieurs hôtes et ne transforme
pas un bail en preuve d'effet externe. Les tests Hard et Human–AI vérifient le
refus d'une heure future et le comportement nominal des baux.
