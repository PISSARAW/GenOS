# ADR 0083 — Intégration d'A-Team au Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, A-Team, sous-topologies, autorité
- **Décideurs** : GenOS
- **Lié à** : ADR 0076, ADR 0078

## Contexte

Un groupe A-Team peut fournir plusieurs capacités coordonnées et être consommé
comme une unité. Cette composition ne doit pas transférer l'autorité constitutionnelle
du Host au sous-groupe.

## Décision

L'adaptateur charge un `TeamRun` A-Team persistant et terminé, exige des preuves de
livraison, puis le présente au Host comme un candidat `SUB_TOPOLOGY` de topologie
`a_team`. Ses capacités sont dérivées des capacités déclarées de l'équipe et de ses
membres terminés. L'adaptateur n'admet ni n'exécute l'équipe. Le contrat et les gates
Holobionte restent applicables, et le Host conserve explicitement l'autorité finale.

## Conséquences

### Positives

- Le Host peut contracter avec une équipe coordonnée comme une unité.
- La capacité découle de la composition persistée de l'équipe terminée.
- L'autorité du Host reste explicite.

### Négatives

- L'équipe doit avoir une exécution persistée et terminée.
- Les références de livraison doivent être fournies et vérifiées par le flux d'admission.

## Alternatives

- Promouvoir automatiquement toute équipe formée en symbionte : rejeté, car une
  équipe non terminée n'a pas encore démontré ses capacités.
