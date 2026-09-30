# ADR 0205 — Brancher les parcours AEIS et causalité procédurale

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : backend / assurance épistémique / causalité
- **Décideurs** : GenOS
- **Lié à** : ADR 0198, ADR 0204

## Contexte

Le pont AEIS vers la promotion existait, mais la biocénose, la rétroaction
homéostatique et les revues multi-provider n'étaient pas intégrées dans le
parcours de décision. Les services de diff causal et d'analyse multi-snapshots
étaient également absents du handler temporel de production.

## Décision

- Recruter un vérificateur de niche disponible lorsque la diversité fonctionnelle
  mesurée est faible, puis appliquer le feedback homéostatique avant la décision
  finale du Host. Toute réfutation résultante reste soumise au veto du Host.
- Exécuter les revues multi-provider uniquement lorsque la politique du contrat
  les active et qu'au moins deux fournisseurs distincts sont configurés. Les
  processus sont isolés; leurs sorties ne sont ni des reçus signés ni des preuves
  d'assurance de promotion.
- Router `causal_diff` vers le diff de forks persistés ou vers l'analyse de
  snapshots persistés selon les identifiants reçus. Conserver la comparaison de
  trajectoires en mémoire pour les appels existants.
- Borner les conclusions causales aux snapshots, runner, environnement, budget et
  seeds déclarés.

## Conséquences

### Positives

- Les services AEIS et causaux ont désormais un chemin runtime explicite.
- Les sorties de fournisseurs non authentifiées ne peuvent pas satisfaire le gate.
- Les expériences persistées sont accessibles via la primitive temporelle et
  possèdent une analyse reproductible avec seed explicite.

### Négatives

- La revue multi-provider peut engager des coûts et transmettre le claim aux
  fournisseurs configurés; elle est donc inactive sans politique explicite.
- Les analyses restent circonscrites aux contrôles et entrées enregistrés; elles
  ne démontrent pas une causalité générale.

## Alternatives

- Promouvoir directement la convergence multi-provider : rejeté, car ces réponses
  ne portent pas l'authentification et la provenance exigées par le gate.
- Remplacer le chemin courant de `causal_diff` : rejeté afin de maintenir la
  compatibilité avec les comparaisons de trajectoires en mémoire.
