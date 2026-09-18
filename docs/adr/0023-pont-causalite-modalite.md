# ADR 0023 — Pont borné entre causalité et modalité

- **Statut** : Accepté
- **Date** : 2026-09-18
- **Domaine** : Mondes possibles, causalité, épistémologie
- **Lié à** : [ontologie opérationnelle](../03-reference/ontologie-operationnelle.md), [moteurs logiques bornés](0020-moteurs-logiques-bornes-et-semantique.md)

## Contexte

Les mondes possibles persistés et le service causal produisaient des résultats
séparés. Une analyse contrefactuelle pouvait donc perdre la relation explicite
avec le monde hypothétique et, lorsqu'un modèle était fourni, avec son évaluation
modale.

## Décision

`evaluateCausalDependence` conserve le verdict causal borné et peut recevoir un
`modalModel` optionnel. Celui-ci est évalué par le moteur modal existant, puis
retourné comme contexte auxiliaire. Le résultat expose aussi une référence
`hypothetical` au monde et un `epistemic_context` indiquant que l'analyse est
interprétative, simulée et non promouvable.

Le pont ne crée pas de monde, ne modifie pas le runtime et ne déduit pas la
vérité d'une cause. Une preuve vérifiée doit être fournie séparément.

## Conséquences

- Les analyses causales peuvent être reliées à un cadre modal sans dupliquer le
  moteur de Kripke.
- L'absence de modèle modal reste valide et conserve la compatibilité existante.
- Les sorties restent soumises aux gates épistémiques et à la vérification
  indépendante.
