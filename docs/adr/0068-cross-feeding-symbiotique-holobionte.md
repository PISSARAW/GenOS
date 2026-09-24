# ADR 0068 — Cross-feeding symbiotique Holobionte

## Statut

Accepté — dix-neuvième lot du plan Holobionte.

## Contexte

Les chaînes multi-symbiontes produisent des valeurs intermédiaires : corpus de
preuves, résultats vérifiés ou représentations qui deviennent l’entrée d’un
autre résident. La valeur du producteur doit rester traçable même si un autre
symbionte réalise l’étape finale.

## Décision

1. Publier les valeurs intermédiaires comme mémoire épisodique du Host, liée
   au résident producteur, à son contrat, sa capacité et ses preuves.
2. Réserver la consommation aux résidents avec contrat actif et capacité
   correspondante.
3. Enregistrer la consommation et sa preuve, puis créditer le producteur
   dans le ledger de contributions vérifiées.
4. Construire les arêtes `SUPPLIES` à partir des reçus de publication et de
   consommation, sans message direct non journalisé entre symbiontes.

## Conséquences

- Les producteurs intermédiaires reçoivent un crédit mesuré quand leur valeur
  est consommée et vérifiée.
- Les mémoires et le ledger réutilisent leurs contrôles AEIS, de confidentialité
  et d’append-only.
- La promotion finale reste sous l’autorité du Host et de ses gates.

## Alternatives

- Ne créditer que le dernier producteur : rejeté, car cela efface la
  contribution du corpus et des vérifications intermédiaires.
- Transmettre les valeurs directement entre symbiontes sans journal : rejeté,
  car la provenance et l’autorisation du consommateur seraient opaques.
