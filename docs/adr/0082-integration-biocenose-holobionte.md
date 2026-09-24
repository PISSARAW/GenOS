# ADR 0082 — Intégration de Biocénose au Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, Biocénose, jugement, autorité
- **Décideurs** : GenOS
- **Lié à** : ADR 0058, ADR 0073, ADR 0078

## Contexte

Certaines décisions du Host bénéficient d'un jugement pluraliste, notamment quand
elles comportent une incertitude importante ou des interprétations concurrentes.
La communauté Biocénose ne doit pas recevoir l'autorité finale du Host.

## Décision

Le pont charge un jugement Biocénose persisté, exige son état `DECIDED`, son
association à la communauté demandée et ses références de preuve. Le jugement devient
un avis présenté au Host. La décision est ensuite soumise à la constitution, à
l'autorité et à l'immunité du Host par le gate Holobionte. La réponse expose
explicitement `finalAuthority: HOST`.

## Conséquences

### Positives

- Les avis reposent sur un jugement persistant et réglé.
- Les preuves du jugement sont transmises au gate Host.
- Biocénose conseille sans remplacer l'autorité constitutionnelle du Host.

### Négatives

- Un jugement non réglé ou sans preuves ne peut pas soutenir la décision.
- Le pont dépend des formats persistés des deux systèmes.

## Alternatives

- Laisser la communauté rendre la décision finale : rejeté, car cela violerait la
  frontière d'autorité du Host.
