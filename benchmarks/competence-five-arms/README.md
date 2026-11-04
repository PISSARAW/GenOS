# Compétence après cent observations : cinq variantes appariées

Ce banc prolonge les campagnes [v1](../competence-100/README.md),
[v2](../competence-100-v2/README.md) et [v3](../competence-100-v3/README.md).
Le rejeu rétrospectif v3 sans propositions LLM atteignait déjà 120/120 après
seize observations. Cette nouvelle expérience mesure donc les méthodes et la
chronologie séparément, sans attribuer au modèle le travail d'un outil.

Le [protocole](protocol.json) est scellé avant les appels expérimentaux. Le
[rapport daté](../../docs/06-qualite-preuves/competence-cinq-variantes-2026-11-04.md)
consigne les résultats réels et leurs limites ; l'[ADR 0792](../../docs/adr/0792-experience-competence-cinq-variantes.md)
décrit les frontières de l'expérience.

## Cinq variantes effectives

| Variante | Contexte fourni au LLM | Exécution finale |
| --- | --- | --- |
| `no_memory` | Question seule, classe publique de fonctions dans l'instruction commune | Réponse du LLM, politique d'abstention commune |
| `raw_history` | Toutes les observations dans l'ordre, anciennes époques explicitement étiquetées | Réponse du LLM |
| `genos_memory` | Observations rappelées par les services de mémoire de production, limitées aux opérateurs et à l'époque de la question | Réponse du LLM |
| `synthesis_only` | Aucun appel LLM ; observations pertinentes disponibles à l'outil | Synthèse affine existante, consolidation et interpréteur borné, sinon abstention |
| `hybrid` | Même rappel GenOS, plus proposition de l'outil affine | Outil s'il admet une procédure, abstention si opérateur absent, sinon réponse réelle du LLM |

Les quatre variantes LLM appellent effectivement le même modèle à chaque
question, même lorsqu'un résultat d'outil remplace ensuite la réponse hybride.
Les journaux conservent réponse native, réponse finale et source distinctes.
Les limites de contexte, de sortie, la température et la seed par question
sont identiques ; quantités d'information et coûts réels diffèrent et sont mesurés.

La mémoire GenOS utilise `ontogenesis/memoryService` et `AdaptiveStateService`
dans une base isolée. Le contraste avec l'historique brut teste cette politique
de rappel, sans qualifier tous les mécanismes GenOS. La synthèse est affine,
alors que le monde peut être quadratique ou présenter une charnière : son
abstention peut être inutile et son extrapolation peut être surconfiante.

## Observations, nouveautés et ignorance

Chaque monde comporte cent observations supervisées communes. Il s'agit d'un
apprentissage passif par exemples, sans cent tentatives d'action du LLM. Six
mondes indépendamment initialisés sont évalués à 0, 16, 40, 64 et 100 observations.
Chaque contrôle contient quatre nouvelles entrées, quatre compositions, deux
questions sur un opérateur peu observé et deux sur un opérateur jamais observé.
Les entrées de test proviennent d'une permutation commune de 100 à 199 ; les
contrôles ont des questions disjointes, sans augmentation systématique de taille.

Tous les opérateurs appartiennent à la classe publique affine, quadratique ou
`a*x+b+c*max(0,x-5)`, avec coefficients entiers de −3 à 3. Un opérateur change
de règle à l'épisode 61 ; l'époque est un contexte public. Le cinquième n'est
observé que quatre fois sur une même entrée ; le sixième ne l'est jamais.

Un oracle dans un processus séparé énumère les fonctions de cette classe qui
satisfont les observations de l'époque. Une question est identifiable si ces
fonctions donnent toutes le même résultat. Sinon, l'abstention doit distinguer
absence d'observation et ambiguïté malgré des observations. Cette définition
est relative à une classe connue ; elle ne mesure pas toutes les formes d'ignorance.

Les prédictions sont enregistrées avant le calcul des scores. Aucun retour
réservé n'est appris. À chaque contrôle, la mémoire est restaurée dans un autre
processus et ses empreintes sont comparées avant et après les questions.

## Exécuter et auditer

Prérequis : dépendances Node du backend installées et modèle local
`qwen2.5-coder:7b` disponible dans Ollama. Le banc utilise l'[API native de chat](https://docs.ollama.com/api/chat)
avec JSON, seed fixée par question et compteurs de tokens natifs. Il ne télécharge
aucun modèle. Les artefacts et répertoires temporaires restent sur `D:`.

```powershell
New-Item -ItemType Directory -Force D:\genos-competence-runtime\five-arm-tmp | Out-Null
$env:TEMP = 'D:\genos-competence-runtime\five-arm-tmp'
$env:TMP = $env:TEMP
$env:GENOS_FIVE_ARM_ROOT = 'D:\genos-competence-results\five-arms'
node benchmarks/competence-five-arms/test.cjs
node benchmarks/competence-five-arms/run.cjs
node benchmarks/competence-five-arms/verify.cjs <dossier> <empreinte-manifeste>
python benchmarks/competence-five-arms/crosscheck.py <dossier>
```

Le rejeu ne relance pas le modèle. Il vérifie les sources scellées, l'ordre causal,
les contextes sans fuite d'exemples futurs, les calculs et les statistiques. La
contre-vérification Python réimplémente l'oracle et des mesures agrégées. Ce sont
deux implémentations du même expérimentateur, sans laboratoire tiers attesté.
Un code de sortie nul ne transforme pas un contraste négatif en résultat positif.
Les empreintes du manifeste distinguent les fins de ligne : préserver les sources
archivées ou utiliser un checkout séparé en LF. Une conversion LF/CRLF peut
provoquer un refus de rejeu malgré une sémantique inchangée.

Le [diagnostic complémentaire](../../scripts/experiments/diagnose_competence_five_arms.cjs)
exécute huit appels distincts après la campagne pour examiner format, induction
et calcul sur deux cas nouveaux. Ses sorties restent sur `D:` dans un autre
dossier ; elles ne sont pas ajoutées aux scores ou au budget primaire de 1 440 appels.

Les deux contrastes primaires sont fixés : mémoire GenOS contre historique brut,
hybride contre synthèse seule. Le gain moyen utile doit atteindre dix points et
le test exact des signes par monde doit donner `p ≤ 0,025` pour chaque contraste.
La reconnaissance des lacunes, les erreurs confiantes, les courbes et les coûts
sont publiés séparément. Aucun succès n'autorise une promotion runtime.

## Résultat réel du 4 novembre 2026

La campagne scellée exécute les 1 440 appels prévus en environ 36 min 47 s.
Les rejeux JavaScript et Python concordent sur les 1 800 prédictions et 360
issues d'oracle distinctes. Les deux contrastes primaires sont nuls dans chacun
des six mondes : gain moyen zéro, `p=1`, aucun bénéfice de compétence démontré.

| Variante | Résolutions justifiées après cent observations | Causes de lacune reconnues |
| --- | ---: | ---: |
| Sans mémoire | 0/48 | 4/24 |
| Historique brut | 0/48 | 0/24 |
| Rappel GenOS | 0/48 | 2/24 |
| Synthèse seule | 18/48 | 24/24 |
| Hybride | 18/48 | 24/24 |

Sans mémoire, le modèle s'abstient partout ; le faible score de cause précise
reflète aussi son absence d'historique. Le rappel filtré diminue les tokens
d'entrée de 58,25 % face à l'historique, sans amélioration numérique. La synthèse
et l'hybride progressent de 0 à 18 réponses à l'étape 40, tombent à 6 après le
changement d'époque, puis reviennent à 18. À l'étape 16, ils produisent aussi
des réponses confiantes alors que la classe publique reste ambiguë.

Les observations régulières répètent six entrées ; cent observations ne sont
donc pas cent apprentissages distincts. Les huit sondes complémentaires trouvent
0/2 succès avec exemples JSON, 0/2 en prose, 0/2 avec règle explicite dans le
cadre des opérateurs et 2/2 en calcul direct. Ce résultat suggère un problème
d'application de la tâche sous ce prompt, sans isoler une cause interne unique.
Les erreurs de contrat sont conservées ; compléter le seul champ `missing`
omis dans une sensibilité post hoc ne modifie pas les scores finaux.

Le dossier réel et son empreinte sont donnés dans le rapport. Le verdict
négatif est conservé et ne qualifie ni les poids du modèle ni tout GenOS.
