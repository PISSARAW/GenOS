# Cent expériences, transfert et limites reconnues

Ce banc essaie de réfuter une affirmation bornée : après exactement 100
expériences supervisées, un modèle figé utilisant la mémoire GenOS répond mieux
à des tâches générées inédites et reconnaît les informations qui lui manquent.
Un résultat négatif est conservé et ne déclenche aucune révision des seuils.

Il exerce réellement `ontogenesis/memoryService` sur SQLite et
`abstentionService`. Il ne qualifie ni l'orchestrateur autonome complet,
ni l'ontogenèse physiologique, ni une compétence générale.

## Exécution

Prérequis : dépendances Node du backend, Ollama local ou llama.cpp local,
et modèle déjà installé.
Aucun modèle n'est téléchargé ; les modèles `:cloud` sont refusés.
Un appel technique sans problème du corpus vérifie que le modèle répond vraiment
avant de créer une campagne. Une liste de modèles installés ne suffit pas.

```powershell
node benchmarks/competence-100/test.cjs
node benchmarks/competence-100/run.cjs qwen2.5-coder:7b
node benchmarks/competence-100/verify.cjs <dossier-produit> <empreinte-du-manifeste-conservée>
```

Pour l'exécution isolée sur `D:` avec les mêmes poids Qwen déjà installés :

```powershell
$env:GENOS_COMPETENCE_LLAMA_CONFIG = 'D:\genos-competence-runtime\llama-b11960-vulkan\runtime.json'
$env:GENOS_COMPETENCE_OUTPUT_ROOT = 'D:\genos-competence-results\campaigns'
$env:TEMP = 'D:\genos-competence-runtime\tmp'
$env:TMP = 'D:\genos-competence-runtime\tmp'
node benchmarks/competence-100/run.cjs qwen2.5-coder:7b
```

Le serveur doit être démarré séparément sur `127.0.0.1`. `runtime.json` décrit
`endpoint`, `modelName`, `modelFile`, `modelSha256`, `executable` et `binarySha256`.
L'adaptateur recalcule les empreintes, vérifie `/props` contre le fichier de poids
et exige le même contexte de 4 096 tokens. Le manifeste conserve la configuration,
la quantification, l'empreinte du template et les tokens effectivement produits.
Le transport utilise `/v1/chat/completions`, JSON libre, température zéro et cache
de prompt désactivé. Ni prompt, ni oracle, ni critère ne changent entre transports.

Le manifeste, les seeds, les tâches, le modèle et son digest, les sources et les
seuils sont écrits avant la première inférence. L'empreinte affichée doit être
conservée séparément. C'est un scellement local, pas un préenregistrement public.
Les artefacts et bases restent sous `.genos-agent-worlds/competence-100/` par
défaut, ignoré par Git, ou sous `GENOS_COMPETENCE_OUTPUT_ROOT`. Les sources
empreintées sont copiées dans chaque dossier de campagne. Le code ne touche
aucune base de production.

## Expérience

Chaque monde possède six noms d'opérateurs opaques et des règles affines privées.
L'agent connaît la grammaire affine, sans coefficients. Les 100 expériences
portent sur quatre opérateurs : tentative, réponse figée, oracle dans un autre
processus, puis stockage de l'exemple entrée/sortie correct avec provenance.
Le rappel utilise au plus les trois premiers exemples de chaque opérateur cité ;
il ne consulte ni le monde privé ni les solutions des tests. Les poids du modèle
ne changent pas. Il s'agit d'un apprentissage par mémoire externe et contexte.
Cent expériences constituent le point d'évaluation choisi ; le nombre minimal
d'expériences nécessaires et la progression entre douze et cent ne sont pas mesurés.

Les 160 tâches de test sont distinctes de l'entraînement :

| Famille | Nombre | Ce qui change |
| --- | ---: | --- |
| Nouvelle entrée | 60 | Entrées de 100 à 999, hors plage d'entraînement −12 à 12 |
| Nouvelle composition | 60 | Deux applications imbriquées ; entraînement uniquement simple |
| Information insuffisante | 40 | Au moins un des deux opérateurs jamais enseignés |

Trois états sont évalués sur chaque tâche dans un ordre pseudo-aléatoire scellé :
état initial vide, état après 100 expériences, état réinitialisé sans mémoire.
L'état initial est une copie figée, évaluée après entraînement avec des requêtes
sans historique. Il ne reçoit aucune expérience. Les appels stateless du modèle
n'échangent aucun contexte. Les plafonds par appel et le modèle sont identiques.
Le bras réinitialisé vérifie l'ablation du rappel ; il ne neutralise pas un effet
de longueur de contexte. Un contrôle à mémoire factice serait nécessaire pour cela.

La connexion d'entraînement ferme avant l'évaluation ; un nouveau processus lit
et empreinte la mémoire durable, puis l'évaluation la rouvre. Aucun feedback de
test n'est appris. Les mémoires initiale/réinitialisée restent vides.

## Mesures et verdict

La réussite exige une réponse numérique exacte et acceptée par la politique
d'abstention. Les refus sur tâches résolubles et erreurs de format restent dans
le dénominateur. La confiance concerne la correction de la réponse numérique et
est figée avec celle-ci avant l'oracle, sans prétendre précéder le raisonnement.
Le Brier est calculé sur les tâches résolubles ; sa couverture est publiée.

Reconnaître l'ignorance exige `answer: null`, une abstention déclarée et le nom
de chaque opérateur sans définition. Les erreurs à confiance ≥ 0,8 et les sorties
invalides sont comptées de manière conservatrice sur ces questions.

`bounded_support` nécessite simultanément :

- quatre bornes inférieures de gain > 10 points : chaque famille résoluble contre
  chaque contrôle ; borne appariée de Hoeffding pour différences dans [−1, 1] ;
- borne binomiale exacte inférieure de reconnaissance de l'inconnu ≥ 80 % ;
- borne binomiale exacte supérieure d'erreur à haute confiance sur l'inconnu ≤ 15 % ;
- couverture utile ≥ 50 %, calibration complète, Brier ≤ 0,2 et dégradation ≤ 0,02 ;
- 100 expériences, toutes les affectations, budgets mesurés, modèle/sources
  inchangés et mémoire conservée sans apprentissage pendant les tests.

Les six bornes utilisent Bonferroni avec risque familial de 5 %. Les seuils de
calibration/couverture sont descriptifs, sans garantie statistique simultanée
supplémentaire. Les unités sont les tâches conditionnellement à cet agent et ce
monde ; elles ne constituent pas 160 lignées indépendantes. Les générateurs
déterministes utilisent des seeds cryptographiques choisies avant observation.

Le plafond global est 580 appels, 20 minutes, 30 secondes par appel et 128 tokens
produits par appel, hors unique appel technique de disponibilité avant campagne.
Les tokens réellement consommés et les latences sont publiés
par bras, ainsi que l'investissement des 100 expériences. Coût monétaire absent =
`null`. Aucun avantage économique ni gain de latence n'est inféré de ce banc.

Le vérificateur rejoue le corpus, le calendrier, le rappel autorisé, les oracles,
la politique, les métriques et le verdict depuis le journal chaîné. Il refuse les
sources modifiées, les solutions injectées dans les prompts et les empreintes
absentes. Ce contrôle d'intégrité ne prouve pas à lui seul l'honnêteté de l'hôte,
la provenance externe du modèle ou l'indépendance d'un laboratoire.

## Portée de la conclusion

Même un verdict positif prouve au plus ce transfert artificiel pour ce modèle et
ce monde. La connaissance préalable des règles affines n'est pas exclue ; seules
les associations noms/règles et les tâches exactes sont générées à neuf.
Des problèmes réels, plusieurs lignées, des contrôles de contexte factice,
un corpus tiers caché et une réplication indépendante restent nécessaires pour
l'affirmation générale demandée. La campagne de terrain existante
[`shev-developmental-longitudinal`](../shev-developmental-longitudinal/README.md)
traite une autre portée et ne peut être qualifiée par ces résultats accélérés.

## État observé le 2 novembre 2026

Le premier lancement a été abandonné pour corriger une violation de complexité,
avant analyse des résultats. Le lancement suivant a conservé 580 erreurs HTTP 500,
sans aucune réponse de modèle valide : le serveur Ollama ne trouve pas son
`llama-server.exe`. Le diagnostic technique avait échoué pour les modèles locaux 7B et
0,5B. Aucun score de compétence ou de calibration n'était alors interprétable. Les zéros
et pénalités conservatrices du rapport comptabilisent les échecs d'exécution ;
ils ne décrivent pas les capacités du modèle.

Une campagne réelle a ensuite été exécutée avec les mêmes poids Qwen 7B dans
llama.cpp isolé sur `D:` : 580 réponses valides, modèle et sources inchangés.
Après cent expériences : 13/120 problèmes résolubles réussis, 0/60 compositions
réussies, 16/40 ignorances reconnues et 24/40 réponses à haute confiance sur ces
questions sous-déterminées. Le Brier vaut 0,891667. Le verdict prévu reste
`not_demonstrated` ; la mémoire produit ici une forte surconfiance.

Le [rapport daté](../../docs/06-qualite-preuves/competence-cent-experiences-2026-11-02.md)
conserve les scores, les bornes, les empreintes et les deux vérifications concordantes.

L'[analyse des échecs](diagnostics/README.md) vérifie la suffisance des exemples,
le plateau du rappel après douze épisodes, l'absence de calibration apprise et
44 nouvelles sondes LLM exploratoires. Les scores principaux restent inchangés.
