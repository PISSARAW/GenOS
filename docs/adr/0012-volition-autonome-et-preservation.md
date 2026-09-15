# ADR 0012 : Volition autonome et preservation

## Decision

GenOS expose une volition interne de preservation derivee de l'observation du
monde: pression budgetaire, stress, menace et integrite. Cette volition peut
selectionner le but endogene `Conserve` sans mission externe.

La volition reste une demande de planification. Elle ne peut pas elargir les
permissions, les leases, le budget, le sandbox, les gates de preuve ou la
promotion. Un etat apoptotique est terminal pour la boucle autonome et inhibe
toute action.

## Consequences

- Le runtime peut reduire son activite pour preserver sa viabilite.
- La decision est deterministe et testable a partir de `WorldState`.
- La survie n'est pas un droit d'execution: le directeur et les controles
  existants restent autoritaires.