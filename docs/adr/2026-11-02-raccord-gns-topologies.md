# Raccordement GNS aux huit topologies

- Statut : accepté
- Date : 2026-11-02

## Décision

Le lanceur de workers topologiques enregistre, avant leur démarrage, une projection
minimale `nervousTopology` dans leurs métadonnées persistées. Cette projection
contient le mode, la mission, l'orchestrateur et les références de dépendances de
la composition réelle. L'écriture exige l'identité, l'attachement à la mission et
des workspaces du même tenant pour le worker et son parent. Une mise à jour
concurrente est détectée par comparaison de l'ancienne valeur JSON.

Le pont GNS relit cette projection pour chaque observation persistée. Trinity,
A-Team, Biocénose, Syncytium, Holobionte, Métapopulation, Rhizome et Biome passent
par le même lanceur et utilisent leurs identités réellement incarnées. Aucune
liste de pairs fictifs n'est produite à partir du seul nom du mode.

Le graphe de surveillance contient les relations de supervision enfant vers
parent et les dépendances de travail dont le producteur est identifié sans
ambiguïté. Il décrit la supervision des workers, pas l'ensemble des détails
internes des CRDT, des colonies ou des mondes Trinity. Une dépendance sans
identité résolue demeure inconnue. Les groupes d'autres missions sont exclus.

Les métadonnées permettent la reconstruction après réouverture de la base.
Une transition partiellement appliquée présentant plusieurs modes est refusée ;
un prochain événement relit la nouvelle configuration. Le graphe sélectionné
est ensuite scellé dans le signal GNS, ce qui isole les observations concurrentes.
L'activation reste `GENOS_NERVOUS_ENABLED=1`.

## Frontières

Les ondes proposent seulement une surveillance locale, sans message de contenu,
modification des topologies, arrêt de worker ou autorisation nouvelle. Les reçus
restent non vérifiés. Les limites GNS de graphe et de propagation s'appliquent.
La panne de projection n'empêche pas le lancement principal ; une identité non
projetée ne devient pas artificiellement surveillée.

## Vérification

`node --test backend/tests/nervous/gnsTopologies.test.js` couvre les huit modes,
le pont de télémétrie réel sur SQLite, le raccordement du lanceur, la réouverture
d'une base sur fichier, les transitions incohérentes, les scopes et la désactivation.
