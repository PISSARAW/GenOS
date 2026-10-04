# ADR 0278 — Simulation écologique bornée du Holobionte

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, microbiome adaptatif, fitness
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0277

## Contexte

L'évaluation écologique consommait des historiques fournis mais ne conduisait pas
elle-même une simulation longitudinale, ce qui laissait aux appelants la maîtrise
des cycles et du passage d'état.

## Décision

Fournir une simulation séquentielle bornée à vingt cycles. Chaque cycle reçoit l'état
et l'historique précédents et doit produire fitness et références de preuve. La
simulation s'arrête à la borne ou sur signal explicite d'arrêt/dysbiose. Elle produit
une recommandation prudente; le remplacement reste séparé et désactivé.

## Conséquences

### Positives

- Un parcours longitudinal est reproductible et borné.
- Les preuves sont exigées cycle par cycle.

### Limites

- La simulation ne persiste pas chaque cycle indépendamment; son reçu est persisté
  par l'évaluation runtime qui l'englobe.
- La qualité du modèle de cycle reste à vérifier indépendamment.

## Alternatives

- Accepter un historique opaque : rejeté, car le runtime ne pourrait pas contrôler
  le séquencement ni exiger les preuves de chaque cycle.
