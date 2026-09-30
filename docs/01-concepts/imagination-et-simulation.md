# Imagination et simulation interne

## Statut

Cette capacité est **implémentée et testée** dans `crates/genos-creativity`.
Elle désigne une simulation computationnelle bornée, pas une équivalence avec
l'imagination biologique ni une conscience.

La persistance interprocessus est disponible via `PersistentCreativityEngine`;
le runtime historique peut l'activer avec `GenosEcosystem::enable_creativity_checkpoint`.

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
contraintes applicables, un score de faisabilité et un `StateDelta` structuré
(budget, observation et concepts testés) permettant une comparaison ultérieure
avec l'état effectivement observé. La contrainte
`evidence_required_before_promotion` est ajoutée avant toute exécution : une
idée simulée n'est donc jamais confondue avec un résultat démontré.

## Correspondance avec le modèle fourni

| Fonction | GenOS |
| --- | --- |
| mémoire de fragments | historique de `RawHypothesis` + dépôt mémoire de l'écosystème |
| recombinaison | payload marqué `recombined` avec `fragments` |
| simulation mentale | `SimulationTrace` avant l'exécutif |
| contrôle préfrontal analogue | `SalienceGate`, objectif, faisabilité et budget |
| exploration | sélection aléatoire et biais de nouveauté |
| évaluation | issue validée, falsifiée ou erreur + erreur de prédiction mesurée |
| apprentissage | signal dopaminergique et consolidation |
| prédiction d'issue d'action | `worldModelService` : chaque action prédit son succès, surprise 1/0,25/0, flag `surprise` ≥ 0,5 |
| rollout contrefactuel | `counterfactualRolloutService` : 2-4 branches prédites (VTE), effondrement evidence+surprise, avis seulement |

## Limites honnêtes

Le moteur ne possède pas de perception sensorielle, de cortex, de vécu ou de
créativité générale. Ses fragments sont des structures JSON internes et ses
prédictions sont des heuristiques. Seule l'exécution suivie d'une preuve peut
promouvoir une hypothèse ; le score de nouveauté ou de faisabilité ne constitue
pas une preuve de vérité.

Le moteur expose `CreativeMemory` pour exporter/importer les hypothèses, le
compteur de tick et les métriques cumulées. `CreativeMemoryStore` écrit ce
payload dans un checkpoint JSON versionné et vérifié par checksum; l'écriture
passe par un fichier temporaire synchronisé puis renommé. Un checkpoint absent
signifie un démarrage vierge. Un JSON invalide, un schéma inconnu ou un checksum
incorrect retourne une erreur et n'est pas importé.

`PersistentCreativityEngine::open(config, checkpoint_path)` restaure l'état au
démarrage et sauvegarde à chaque `pre_tick`. `GenosEcosystem::enable_creativity_checkpoint`
branche cette persistance sur le tick historique; le chemin est choisi par
l'appelant. Les candidats sont consignés dans l'événement `CREATIVE_SIMULATION`.
Ils restent des simulations et n'ajoutent pas d'étapes au plan d'exécution.
Une erreur de checkpoint arrête le tick. Un checkpoint absent démarre une
mémoire vierge; un checkpoint invalide provoque une erreur de démarrage. La
restauration ne reprend pas l'état du générateur aléatoire; les hypothèses
existantes et métriques sont conservées, mais la génération suivante n'est pas
reproductible à l'identique.

Le test d'acceptation
`test_imagination_recombines_memory_and_simulates_before_execution` vérifie que
la seconde génération recombine effectivement la mémoire et produit une trace
de simulation soumise aux contraintes d'évidence.

La décision d'architecture de persistance est décrite dans [l'ADR 0184](../adr/0184-persistance-moteur-creativite.md).
