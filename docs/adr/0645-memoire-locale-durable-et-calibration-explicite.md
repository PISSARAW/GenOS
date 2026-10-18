# ADR 0645 — Mémoire locale durable et calibration explicite

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Portée** : rappel vectoriel, mémoire ancestrale, héritage de risque, STDP

## Contexte

La projection déterministe de tokens en 768 dimensions permettait un rappel local,
mais son résultat pouvait être confondu avec un embedding sémantique. Les outils de
mémoire ancestrale et d'héritage de risque reposaient sur des `Map` en mémoire et
perdaient leur contenu au redémarrage. Enfin, plusieurs seuils étaient dispersés
dans le code sans version de calibration, et la métaphore STDP ne précisait pas
dans ses reçus que seuls des poids du graphe symbolique étaient modifiés.

## Décision

Le rappel expose désormais un contrat `retrieval` qui distingue
`semantic_embedding`, `lexical_fallback` et `caller_supplied_vector`. Le fallback
lexical reste local et déterministe, mais n'est jamais déclaré sémantique. Le mode
`requireSemantic`, ou `GENOS_MEMORY_REQUIRE_SEMANTIC=true`, échoue fermé si aucun
provider sémantique local ou distant n'est disponible.

Les outils MCP `genos_ancestral_memory` et `genos_risk_inheritance` utilisent deux
tables SQLite scopées par organisation, projet et lignée. Leurs lectures survivent
à une fermeture/réouverture de la base et ne traversent pas les tenants.

Les seuils mémoire sont regroupés dans `shared/memoryCalibration.json`, avec une
version, un statut et la preuve disponible. La version initiale est
`provisional` : le benchmark actuel démontre le rappel durable, mais aucune
modification causale de décision. Un seuil ne devient `qualified` que si chaque
classe contient au moins dix observations et si l'accuracy équilibrée atteint
0,65. Cette porte est une règle minimale de qualification, pas une preuve de
généralisation.

Enfin, chaque mise à jour STDP réussie déclare
`learningDomain = symbolic_memory_graph` et `modelWeightsUpdated = false`.

## Conséquences

Le fonctionnement dégradé hors réseau demeure possible, sans faux étiquetage
sémantique. Les appels exigeant la sémantique peuvent refuser explicitement ce
mode. La mémoire de lignée devient une capacité durable et isolée, au coût de deux
tables et d'une migration SQLite. Les constantes restent utilisables, mais leur
statut provisoire est visible et leur promotion devient testable.

STDP reste un apprentissage associatif du graphe de mémoire ; aucune adaptation du
modèle de langage n'est revendiquée.

## Vérification

- `node backend/tests/test_memory_critique_corrections.js`
- `node backend/tests/test_memory_plasticity_concepts.js`
- `python scripts/ci/check_code_quality.py`
