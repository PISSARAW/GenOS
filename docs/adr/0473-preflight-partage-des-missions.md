# ADR 0473 — Préflight partagé des missions Ontogenesis

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Admission des missions et cohérence des capacités.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0472, séparation entre exécution worker et promotion.

## Contexte

Le plan de mission transmettait ensemble deux vocabulaires distincts : les
capacités génériques du sélecteur (`execute`, `verify`, `coordinate`, `analyze`,
`observe`) et le contrat canonique de topologie (`EVIDENCE_BARRIER`,
`SIGNALING_BUS`, etc.). Le premier sert à admettre une topologie ; le second
décrit les capacités GenOS attendues à pleine maturité. Une déclaration de
capacité ne prouve pas qu’une exécution ou une promotion est valide.

## Décision

Chaque plan de mission produit un préflight versionné qui sépare :

- les besoins génériques de la topologie sélectionnée et les capacités déclarées
  par la configuration ;
- le contrat canonique mode + organisation et l’état de maturité du catalogue ;
- les concepts demandés indisponibles et les références de preuve requises à
  l’intégration.

Une capacité générique explicitement absente, une morphologie invalide ou un
concept runtime demandé mais inconnu/incompatible bloque le dispatch. Les
capacités canoniques partielles ou conceptuelles sont exposées comme écarts,
sans constituer à elles seules un gate universel. Le préflight est recalculé
après la sélection finale de topologie et transmis au runner. Il constitue un
contrat d’admission et de visibilité, jamais un reçu de preuve d’exécution ou
de promotion.

## Conséquences

### Positives

- Les champs génériques ne sont plus pris pour des capacités canoniques.
- Les écarts de maturité restent visibles sans refuser toutes les topologies
  qui ne sont pas entièrement opérationnelles.
- Les demandes de concepts inconnus ou runtime incompatibles échouent avant le
  lancement ; les contrats philosophiques conservent leurs preuves
  d’intégration requises.
- Le runner reçoit le même préflight que le plan et que le dispatch final.

### Négatives

- Un préflight sans liste de capacités déclarées est marqué non vérifié ; les
  contrôles du sélecteur et les gates ultérieurs restent nécessaires.
- Le statut opérationnel du catalogue décrit une maturité déclarée et ne
  remplace pas la preuve d’un effet sur une mission.

## Alternatives

- Fusionner `execute` avec `EVIDENCE_BARRIER` ou d’autres capacités canoniques :
  rejeté, car les vocabulaires représentent des contrats différents.
- Bloquer toute capacité canonique partielle : rejeté, car le contrat décrit la
  pleine capacité et provoquerait des refus généraux non justifiés.
- Traiter le préflight comme une preuve de promotion : rejeté, car la promotion
  exige des reçus et les gates dédiés.

## Vérification attendue

Vérifier qu’une sélection Trinity avec `execute` et `verify` est admise même si
`EVIDENCE_BARRIER` est partielle, qu’un besoin générique absent et un concept
runtime demandé mais indisponible bloquent avant le dispatch, et qu’un contrat
philosophique garde sa preuve d’intégration sans devenir une preuve de
promotion.
