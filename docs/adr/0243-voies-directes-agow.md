# ADR 0243 — Voies cognitives directes via le Signal Plane

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, Signal Plane, automatisation
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0006, ADR 0007, ADR 0242

## Contexte

Les trajectoires répétées peuvent justifier une livraison spécialisée entre organes,
mais un nouveau bus créerait une seconde voie de transport difficile à auditer. Les
poids des canaux du Signal Plane sont globaux et ne portent pas les exigences métier
et contextuelles d'une procédure.

## Décision

Ajouter un registre persistant par agent pour des voies `source -> target`, avec
capacité, type sémantique, signature de contexte, confiance et statut de consolidation.
Le routeur publie les notifications directes sur le `signalEventBus` du Signal Plane;
les organes peuvent s'abonner au topic de leur module. Active Query peut sélectionner
un handler d'une voie consolidée à la place de l'allocation d'attention habituelle,
uniquement en politique `bounded` ou `live`.

Les routes non consolidées ne sont jamais résolues. Les actions irréversibles, à fort
enjeu, à faible confiance causale, soumises à accord utilisateur, sensibles à la
sécurité ou en environnement non stationnaire imposent `requiresGlobalReview`. Une
voie suspendue ne matche plus. La décompilation produit un candidat réel marqué
`procedural_generated` et le soumet de nouveau à AGOW.

## Conséquences

### Positives

- Réutilisation du Signal Plane et des handlers Active Query existants.
- Voies persistées, contextuelles, auditables et suspendables sans promouvoir la
  plasticité automatiquement.
- Les actions critiques restent dans le circuit de revue global.

### Négatives

- Le registre ne peut vérifier la qualité empirique du support ou la provenance du
  producteur qui a demandé la consolidation.
- Les notifications directes in-process ne sont pas une garantie de livraison durable.

## Alternatives

- Créer un bus P2P séparé : rejeté pour éviter un transport parallèle au Signal Plane.
- Router toute voie apprise automatiquement : rejeté pour préserver les gates de
  sécurité, d'autorité et de revue utilisateur.
