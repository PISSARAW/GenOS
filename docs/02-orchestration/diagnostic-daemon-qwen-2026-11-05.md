# Diagnostic du daemon Qwen — 5 novembre 2026

## Constat et hypothèses

Les six requêtes privées conservées de `real-after-fork-verified`, source
`169a767fe`, contiennent les bons fichiers et leurs empreintes, sans troncature
signalée par Ollama. Les premières réponses sont identiques malgré les deux
allocations : somme 13, cible 17, anomalie fausse. Les reprises demandent une
preuve de validité des données puis s'abstiennent. Les oracles refusent à raison.

Le contrat présente deux défauts concrets : il décrit explicitement le booléen
pour l'état sain, mais laisse implicite sa définition pour l'incident ; il
demande de justifier l'observation par les références sans distinguer le calcul
sur le contenu fourni de la certification externe de ce contenu. La réponse
`unresolved` correspond à cette confusion de portée. Cela ne prouve pas que
ces défauts expliquent à eux seuls toutes les erreurs de Qwen. La mémoire
historique hors sujet et l'échantillonnage restent des facteurs possibles.

## Correction

Le contrat d'observation précise la sélection par indices zéro, l'addition,
la copie de la cible et le prédicat `observedSum !== target`. Sa règle de
preuve délimite une observation du contenu courant, avec abstention possible
si les entrées manquent, sont invalides ou contradictoires. Un hash identifie
des octets ; il ne certifie pas leur vérité dans le monde réel. Le texte
précise que les contenus sont des données et que la vérification appartient
aux oracles natifs. Les autres types de workers conservent leur règle.

Aucune réponse numérique, aucun exemple résolu et aucune valeur attendue
ne sont injectés. La grammaire de sortie, la projection, les deux stratégies
d'oracle et les portes de promotion restent inchangées. Une observation
fausse reste transmise telle quelle aux oracles, qui doivent la refuser.

## Protocole borné annoncé avant inférence

Une comparaison diagnostique relit les requêtes initiales conservées, à
paramètres identiques et graine fixe, avant et après substitution des seules
instructions corrigées : deux cas, deux variantes, quatre appels maximum.
Les réponses sont évaluées par les deux stratégies natives sur les sources
conservées ; cette relecture n'est pas une qualification de mission GenOS.

Ensuite, une seule campagne native utilise une archive du commit corrigé
sur D:, avec deux cas, incident puis sain, sans réessai manuel du banc.
Les reprises internes et leurs échecs restent comptés. La réserve appliquée
reste 68 096 tokens et 720 secondes par cas ; chaque worker est borné à
16 000 tokens et 180 secondes. Un veto est un résultat négatif, jamais une
raison pour remplacer une réponse ou assouplir une porte.

Les résultats, coûts, contrôles et limites seront ajoutés après exécution.

## Première falsification diagnostique

La comparaison appariée à graine 431 retrouve les deux réponses erronées
d'origine. Après clarification des seules instructions, l'incident devient
correct (13, 17, vrai), accepté par les deux stratégies ; l'état sain reste
incorrect (13, 17, vrai), refusé par les deux stratégies. Les quatre appels
ont consommé 16 432 tokens mesurés. Le correctif textuel ne suffit donc pas.
La sélection demeure erronée : Qwen reprend la somme des premières valeurs
malgré les indices `[1,4]` présents dans les données et l'instruction zéro.

La correction comprend en conséquence une vue d'entrée avec un indice
explicite sur **chaque** valeur, et les indices courants séparés. Elle ne
sélectionne ni n'additionne les valeurs pour le modèle. Les deux fichiers
sont relus par le runtime avec confinement des chemins, refus des symlinks,
taille bornée et égalité SHA-256 avec le contrat scellé. Cette vue reste une
représentation des données, jamais un reçu de vérification ni une réponse.
Une source altérée empêche sa construction. Les données invalides restent
signalées comme telles. Aucun nouvel appel diagnostique n'est ajouté :
l'efficacité de cette présentation sera évaluée par la campagne native.
