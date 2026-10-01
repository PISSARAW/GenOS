# ADR 0250 — Baseline CTM-style pour les expériences AGOW

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, compétition, comparaison expérimentale
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0249

## Contexte

Comparer AGOW seulement à ses ablations ne mesure pas une politique de compétition
indépendante. La baseline demandée doit rester minimale, exécutable et soumise au même
adaptateur, manifeste, snapshot, corpus et budget.

## Décision

Ajouter `ctmStyleBaselineService`: chaque processeur fournit un `selfRatedScore`, une
softmax stable convertit les scores en activations et le plus haut gagne une compétition
en un tour. `runCtmStyleBaseline` exécute la baseline comme condition expérimentale;
le callback reçoit le vainqueur calculé et doit retourner son `selectedCandidateId`, que
le runner compare avant d'accepter l'outcome. La baseline n'utilise pas les regrets AGOW.

## Conséquences

### Positives

- Condition de comparaison directe et inspectable sous ressources communes.
- Le reçu contient scores, activations, compétiteurs et vainqueur.

### Négatives

- Cette baseline minimaliste n'est pas une reproduction du système CTM-AI publié.
- La validité dépend de la production indépendante des auto-évaluations et du callback.

## Alternatives

- Appeler le scoring AGOW une baseline CTM : rejeté, car cela ne fournirait aucune
  comparaison indépendante.
