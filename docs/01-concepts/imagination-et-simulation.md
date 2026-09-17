# Imagination et simulation interne

## Statut

Cette capacité est **implémentée et testée** dans `crates/genos-creativity`.
Elle désigne une simulation computationnelle bornée, pas une équivalence avec
l'imagination biologique ni une conscience.

## Boucle réalisée

GenOS suit la chaîne suivante :

```text
historique d'hypothèses
        ↓
sélection de fragments parents
        ↓
recombinaison dans un payload nouveau
        ↓
simulation interne (effets, contraintes, faisabilité)
        ↓
gate de saillance et budget ATP
        ↓
exécution éventuelle
        ↓
preuve / falsification / consolidation
```

Une `RawHypothesis` conserve les identifiants de ses parents, les fragments
recombinés et une `SimulationTrace`. La trace contient les effets prédits, les
contraintes applicables et un score de faisabilité. La contrainte
`evidence_required_before_promotion` est ajoutée avant toute exécution : une
idée simulée n'est donc jamais confondue avec un résultat démontré.

## Correspondance avec le modèle fourni

| Fonction | GenOS |
| --- | --- |
| mémoire de fragments | historique de `RawHypothesis` |
| recombinaison | payload marqué `recombined` avec `fragments` |
| simulation mentale | `SimulationTrace` avant l'exécutif |
| contrôle préfrontal analogue | `SalienceGate`, objectif, faisabilité et budget |
| exploration | sélection aléatoire et biais de nouveauté |
| évaluation | issue validée, falsifiée ou erreur |
| apprentissage | signal dopaminergique et consolidation |

## Limites honnêtes

Le moteur ne possède pas de perception sensorielle, de cortex, de vécu ou de
créativité générale. Ses fragments sont des structures JSON internes et ses
prédictions sont des heuristiques. Seule l'exécution suivie d'une preuve peut
promouvoir une hypothèse ; le score de nouveauté ou de faisabilité ne constitue
pas une preuve de vérité.

Le test d'acceptation
`test_imagination_recombines_memory_and_simulates_before_execution` vérifie que
la seconde génération recombine effectivement la mémoire et produit une trace
de simulation soumise aux contraintes d'évidence.
