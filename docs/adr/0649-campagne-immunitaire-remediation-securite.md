# ADR 0649 — Campagne immunitaire de remédiation sécurité

- **Statut** : Accepté pour la verticale synthétique bornée
- **Date** : 2026-10-19
- **Domaine** : sécurité, AEIS, contrefactuels, mémoire négative
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0648, ADR 0652 ; [AEIS](../01-concepts/adaptive-epistemic-immune-system.md)

## Contexte

Une alerte de scanner et sa disparition après modification ne démontrent ni la
cause, ni l'absence de régression, ni la supériorité du correctif. GenOS doit
comparer plusieurs réponses sans transformer un succès de scanner en autorité.

## Décision

Le backend normalise au plus 25 alertes structurées ou SARIF 2.1
(`securityRemediation/securityAlertContract.js`), regroupe les symptômes par
cause en clusters d'antigènes (`antigenGraphService.js`), planifie un contrôle
et trois familles de corrections (`remediationCampaignPlanner.js`), puis
compare les candidats avec deux vérificateurs indépendants
(`campaignAdjudicator.js`). Les workspaces sont isolés, sans réseau ni payload
réel. Les échecs alimentent la mémoire négative.

Les reçus de campagne ne sont pas des reçus AEIS de confiance et n'autorisent
jamais une promotion. La projection doit encore passer par le dossier de preuve,
l'AEIS et le gate de promotion existants.

## Invariants et limites

- formats, chemins et limites invalides échouent fermé ;
- producteur et vérificateurs sont distincts ;
- tout gain est mesuré contre un contrôle vérifié ;
- mémoire négative et score de promotion restent séparés ;
- cette tranche planifie les capsules, sans matérialiser elle-même un GQWF ;
- les tests emploient uniquement une reproduction locale sûre ;
- le mot « antigène » désigne ici un cluster d'alertes de sécurité, à
  distinguer de l'antigène-claim du système immunitaire épistémique (AEIS).

## Preuves exécutables

- `backend/tests/test_security_remediation_ingestion.js` vérifie la
  normalisation bornée et le refus fermé des entrées invalides ;
- `backend/tests/test_security_antigen_graph.js` vérifie le regroupement des
  symptômes par cause ;
- `backend/tests/test_security_remediation_campaign.js` vérifie la planification
  du contrôle et des trois familles de corrections isolées ;
- `backend/tests/test_security_remediation_e2e.js` vérifie l'adjudication avec
  deux vérificateurs indépendants et l'alimentation de la mémoire négative ;
- `npm --prefix backend run test:security-remediation` rejoue l'ensemble.
