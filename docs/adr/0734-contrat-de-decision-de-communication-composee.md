# ADR 0734 — Contrat de décision de communication composé

## Statut

Accepté — mise en œuvre incrémentale.

## Contexte

GenOS possède plusieurs mécanismes de communication : politiques de topologie et
d'organisation, manifestes de capacités par phénotype, profils relationnels,
intentions de checkpoint, sélection d'audience, coûts et grounding. Ils ne sont
pas encore réunis ni appliqués uniformément par les parcours de checkpoint et
`publish/inbox`. Un succès de transport ne prouve pas qu'une décision était
autorisée ou correctement grounded.

## Décision

Introduire un contrat versionné `genos.communication-decision-context/v1` qui
regroupe l'organisation, la topologie et son variant, l'agent et son manifeste,
les relations, l'intention et l'objectif, le scope et le budget. Les données
absentes sont représentées explicitement comme inconnues; elles ne sont pas
inventées.

Les contrôles stricts (autorité, canaux admissibles, scope, confidentialité et
budget) précèdent l'optimisation d'utilité. L'objectif choisit parmi les options
restantes. En cas de conflit non résolu ou de donnée obligatoire absente, le
runtime échoue fermé et conserve un motif explicite. Les reçus distinguent la
décision, l'exécution, la livraison et le grounding.

L'intégration se fait par étapes : checkpoints, politiques topologiques,
`publish/inbox`, reçus, puis benchmark causal. Chaque entrée de communication
doit arriver aux mêmes contrôles sans effacer les règles propres à sa topologie.

## Conséquences

- Les décisions deviennent comparables et auditables à travers les transports.
- Le manifeste doit être réellement appliqué, y compris aux chemins pré-scopés.
- Les voies historiques `publish/inbox` doivent appliquer les contraintes
  partagées tout en gardant leurs contrôles d'autorité existants.
- Les preuves d'exécution et de benchmark restent nécessaires; ce contrat ne
  certifie pas à lui seul la qualité sémantique d'une décision.

## Validation attendue

Tests de contrat, d'échec fermé, de non-contournement des canaux et du budget,
de routage par topologie et de traçabilité des reçus. Une matrice causale doit
ensuite montrer l'effet isolé puis combiné des cinq dimensions.
