# ADR 0649 — Campagne immunitaire de remédiation sécurité

- **Statut** : Accepté pour la verticale synthétique bornée
- **Date** : 2026-10-19
- **Domaine** : sécurité, AEIS, contrefactuels, mémoire négative

## Contexte

Une alerte de scanner et sa disparition après modification ne démontrent ni la
cause, ni l'absence de régression, ni la supériorité du correctif. GenOS doit
comparer plusieurs réponses sans transformer un succès de scanner en autorité.

## Décision

Le backend normalise au plus 25 alertes structurées ou SARIF 2.1, regroupe les
symptômes par cause, planifie un contrôle et trois familles de corrections, puis
compare les candidats avec deux vérificateurs indépendants. Les workspaces sont
isolés, sans réseau ni payload réel. Les échecs alimentent la mémoire négative.

Les reçus de campagne ne sont pas des reçus AEIS de confiance et n'autorisent
jamais une promotion. La projection doit encore passer par le dossier de preuve,
l'AEIS et le gate de promotion existants.

## Invariants et limites

- formats, chemins et limites invalides échouent fermé ;
- producteur et vérificateurs sont distincts ;
- tout gain est mesuré contre un contrôle vérifié ;
- mémoire négative et score de promotion restent séparés ;
- cette tranche planifie les capsules, sans matérialiser elle-même un GQWF ;
- les tests emploient uniquement une reproduction locale sûre.
