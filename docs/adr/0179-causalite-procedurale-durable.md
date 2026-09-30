# ADR 0179 — Exécutions causales procédurales durables

## Statut

Acceptée

## Contexte

La validation causale procédurale compare aujourd'hui des clones en mémoire d'un
état initial. Le parcours répliqué apparie deux bras par seed et émet un reçu,
mais ne permet pas de reprendre durablement un bras interrompu ni de relier les
divergences à un graphe causal interne. Les primitives temporelles homonymes ne
constituent pas cette infrastructure.

## Décision

Introduire un protocole d'expérience causal versionné et append-only. Une
expérience épingle les identifiants et empreintes du snapshot, du runner, du
manifeste d'environnement, du budget et de la méthode d'analyse. Chaque bras,
seed et snapshot dispose d'un fork isolé identifié durablement. L'état d'un fork
et ses événements de progression sont persistés; une reprise ne peut continuer
que si les entrées épinglées et l'état restauré vérifient leurs empreintes.

Les reçus distinguent les faits mesurés, les hypothèses et les limites
d'attribution. Le graphe causal ne contient que des relations référencées à des
événements ou reçus observés. Les comparaisons multi-snapshots conservent les
résultats par snapshot et déclarent leur méthode d'incertitude. Une trace
reconstruite n'est pas une réexécution vérifiée.

L'intégration se fait par étapes. Le chemin causal simple et ses contrats
restent compatibles pendant l'adoption; aucune nouvelle preuve ne contourne les
gates d'évidence ou de promotion.

## Conséquences

- Les expériences et forks deviennent récupérables après redémarrage.
- Les identités et empreintes deviennent des références stables pour replay,
  diff et audit.
- Les transitions persistées nécessitent une migration additive et une API de
  service dédiée.
- Les verdicts restent bornés au runner, snapshots, environnement, budget et
  méthode déclarés; ils ne prouvent pas une causalité universelle.
- Les appels synchrones existants restent disponibles jusqu'à leur migration
  explicite vers le nouveau parcours.

## Phases

1. Contrats et invariants (présent ADR).
2. Forks isolés et persistance/reprise.
3. Replay et diff traçables.
4. Généralisation multi-snapshots et analyse robuste.
5. Attribution par graphe causal référencé.
6. Branchement progressif aux handlers et gates.
