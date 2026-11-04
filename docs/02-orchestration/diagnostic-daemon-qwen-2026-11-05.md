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

Les résultats ci-dessous conservent aussi les échecs ; aucune nouvelle
campagne n'est lancée pour transformer ce verdict en succès.

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

## Qualification native : amélioration partielle, verdict négatif

Source exécutée : `f3201fd3cf9e8e02dcdf6ebfa99fe11747b6165f`.
Racine locale : `D:/GenOS-runs/qwen-daemon-20261105-0005`.
La copie `qualification/runtime` a un `git diff` vide avant et après
exécution. Les changements concurrents du workspace ne sont pas injectés
dans cette copie ; le commit ciblé utilise un index Git isolé.

| Cas | Fenêtre UTC du 4 novembre | Durée native | Appels mesurés | Tokens mesurés | Résultat |
| --- | --- | ---: | ---: | ---: | --- |
| Incident `[0,1]` | 23:30:40–23:32:08 | 88,686 s | 5 | 16 081 | daemon et plan acceptés ; spécialiste non résolu |
| Sain `[1,4]` | 23:32:20–23:34:22 | 122,281 s | 3 | 11 768 | daemon non résolu ; planification non atteinte |

Les deux missions restent `qualified:false`, `genosMissionQualified:false`,
`promoted:false`. Le daemon de l'incident fournit exactement
`{"observedSum":13,"target":17,"anomaly":true}` ; son reçu natif est vérifié.
Le planificateur cite son run, décide `repair`, puis ordonne spécialiste,
vérificateur, récupération avec les dépendances attendues. Le spécialiste,
sa mutation et son fork s'abstiennent : ils déclarent la tâche hors de la
niche `resource_allocation`, alors que cette niche et la tâche sont assignées.
Ce refus n'est pas une preuve d'impossibilité de l'allocation.

Dans le cas sain, la première réponse réclame une observation déjà calculée
dans le JSON d'entrée. Les deux suivantes prétendent que les indices
pourraient être invalides, sans établir de contradiction. Les trois requêtes
contiennent pourtant la vue complète indexée et les indices `[1,4]`.
Il s'agit donc encore d'une confusion entre données à traiter et résultat
à produire, suivie d'abstentions injustifiées par les entrées conservées.
La porte de preuve refuse ces réponses ; aucune observation chiffrée du
cas sain n'est acceptée et aucun calcul n'est substitué à celui du modèle.

**Les défauts de formulation identifiés sont corrigés, mais l'échec du daemon
avec Qwen n'est pas entièrement résolu.** La comparaison appariée isole un
effet favorable du paquet d'instructions sur le booléen de l'incident.
Elle ne démontre ni la causalité exclusive de chaque phrase, ni la fiabilité
de la nouvelle vue indexée : celle-ci ne suffit pas pour l'état sain.
La mémoire hors sujet reste présente. L'effet propre de cette mémoire,
de l'identité, de la présentation des données et de l'échantillonnage n'est
pas séparé par cette campagne. Un nouveau réglage suivi d'essais répétés
ne constituerait pas une preuve de résolution générale.

Le dernier remplacement de chaque cas se bloque sans mesures natives
complètes. Le diagnostic de repli masque encore la cause détaillée du
routeur ; aucun appel fournisseur supplémentaire n'est attesté pour ces
deux runs. Il n'y a pas de substitution native `verified` sur ces cas réels.
Le vérificateur métier, la restauration et la clôture native ne sont pas
atteints. Bootstrap, ADN, clinique, baux, OMEGA, reprise, preuve et arrêt
sont audités ; cela ne qualifie pas « tout GenOS ».

## Vérification des preuves et consommation

`final-analysis.json` rapproche huit captures POST inchangées, huit appels
du journal fournisseur et les douze POST Ollama : huit natifs plus quatre
diagnostiques. Les empreintes des neuf bindings, neuf reçus et trente-cinq
observations biologiques sont recalculées. Le texte brut du constat accepté
correspond à son hash natif. Les deux bases ont zéro run actif et zéro reprise
pendante. Les quatre appels daemon comportent la vue indexée attendue ;
les schémas ne fixent ni somme, ni cible, ni booléen. Aucun oracle ni
normaliseur de réponse n'a été modifié par le commit.

Qwen est `qwen2.5-coder:7b`, Q4_K_M, manifeste
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`,
servi par `D:/ollama/ollama.exe` sur `127.0.0.1:11477`, modèles sur D:,
contexte 16 384, température 0,45 et `top_p` 0,9. Aucun appel concurrent
au modèle n'est autorisé par ce serveur. Les journaux indiquent zéro
troncature. L'identité du processus et du propriétaire du port est contrôlée
avant les appels et avant son arrêt. Seule sa famille est visée ; un
descendant disparaît entre contrôle et arrêt, puis le serveur est arrêté
après nouvelle vérification. Le port est libre au contrôle final. Le modèle
occupe 5 635 173 252 octets de VRAM au relevé `/api/ps` ; ce n'est pas un pic.

Le binaire reconstruit pour cette campagne a SHA-256
`989d6cc3e958c3076676aeb891c540051a424b60c9462c1121d9f68ed26e8a47`.
La provenance conserve l'arbre Rust et le reçu de construction. Les sources
Rust sont inchangées lors du rafraîchissement de la copie ; les modifications
Rust étrangères non committées ne sont pas qualifiées par cette exécution.

Le nouveau sous-total est **44 281 tokens** : 16 432 diagnostiques et
27 849 natifs. Ajoutés aux 44 183 tokens historiques conservés, cela donne
**88 464 tokens mesurés**. Le total global reste non certifié : deux reçus
de remplacement déclarent `worker_llm_tokens` et `worker_provider_billing`
indisponibles. Les rapports publient donc `complete:false`, `modelTokens:null`
et le sous-total `knownModelTokens`, sans remplacer les lacunes par zéro.
Le tarif local déclaré de zéro USD ne mesure ni matériel ni électricité.

## Validation exécutable

- Test du contrat et de la vue indexée : passe, avec source altérée refusée,
  absence de somme/verdict injecté et refus des erreurs de somme, cible et
  booléen par chacune des deux stratégies.
- Test des oracles du workspace : passe.
- Qualité complète de la copie finale : 9 142 fichiers, zéro violation.
- Sept scénarios contrôlés : passent en 495,704 secondes, dont fausse
  observation, plan invalide, mutation, fork et abstention. Le transport LLM
  est simulé, les workers et portes natives sont réels. Artefacts dans
  `tmp/genos-cooperation-live-test-AuhRvn`.
  La relecture SQLite des sept cas confirme zéro run actif et zéro reprise
  pendante ; `recoverFork` porte une substitution native `verified`.
- Construction `cargo build -p genos-cli` : passe. `cargo test --workspace`
  n'aboutit pas dans la borne de 600 secondes pendant la compilation des
  tests/exemples : aucun verdict global Rust n'est déduit de cet arrêt.
- La première tentative `npm test` est invalidée par un binaire absent
  dans la copie de préparation. Elle n'est pas présentée comme une régression.
  Le contrôle après construction atteint la suite backend, mais n'aboutit
  pas dans la borne de 600 secondes. La biologie passe 11/11 ; cela ne vaut
  pas succès de la suite globale. Les descendants de cette suite restés
  actifs après expiration du wrapper sont identifiés par leur filiation,
  leur création et leur copie source, puis arrêtés. Les processus de test
  concurrents appartenant aux autres travaux sont laissés intacts.

Les tentatives de préparation et leurs erreurs sont conservées. Un contrôle
HTTP simulé lancé depuis l'ancienne copie est arrêté avant validation finale,
sans appel réel au modèle ; seul le contrôle `controlled-indexed` ci-dessus
porte sur la copie corrigée complète. Les traces privées, bases, credentials
et artefacts générés restent hors Git. Un manifeste public séparé scelle les
résultats de cette campagne ; les manifestes du 4 novembre sont conservés.
Le manifeste local public contient 60 fichiers, SHA-256
`5d32bf8f1a49f7c2acbb878f5d416df837d76a162104acfdb8df479c41ec8456`.

Le MCP de développement est de nouveau disponible pour ce travail : les
souvenirs d'échec ont été consultés, le snapshot de l'agent de session
`snap-050a74901ce64f93a9ee78356e369d64` est écrit et la décision
`decision-eb0332ad-a85b-407f-bda3-6985307517ea` est persistée. Cette mémoire
ne constitue ni un certificat du code ni une autorisation de promotion.
L'expérience négative `b1df3c8f-ec63-4b0e-90f3-414ac1058965` conserve les
preuves effectives, l'amélioration partielle et les abstentions restantes.
