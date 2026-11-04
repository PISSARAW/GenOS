# Compétence après cent observations : comparaison de cinq variantes

- **Date et dernière revue** : 2026-11-04.
- **Statut** : campagne réelle terminée, rejeux JavaScript et Python concordants.
- **Verdict** : aucun des deux gains primaires n'est démontré.
- **Validation du dépôt** : contrôles ciblés et qualité réussis ; suites globales non entièrement vertes, voir ci-dessous.
- **Portée** : modèle local figé, six mondes générés, rappel épisodique et synthèse affine.
- **Promotion runtime** : aucune.

## Question expérimentale

L'expérience compare le LLM sans mémoire, l'historique brut, la mémoire GenOS,
la synthèse seule et l'agent hybride. Elle répond au diagnostic du 2 novembre :
le [banc v3](competence-procedurale-corrigee-2026-11-02.md) avait réussi mais une
analyse rétrospective sans propositions LLM retrouvait les quatre procédures
aux épisodes 13 à 16 et le score maximal dès seize observations. Les cent
épisodes ne représentaient donc pas cent améliorations comportementales.

Le nouveau [protocole](../../benchmarks/competence-five-arms/protocol.json)
et l'[ADR 0792](../adr/0792-experience-competence-cinq-variantes.md) fixent les
comparaisons avant les appels expérimentaux. Les poids ne changent pas : un
apprentissage par mémoire externe et outils est admissible, mais son origine
doit rester mesurable.

## Dispositif réel

| Variante | Mémoire et méthode |
| --- | --- |
| `no_memory` | Question et instruction commune ; aucune observation rappelée |
| `raw_history` | Toutes les observations chronologiques, époques étiquetées |
| `genos_memory` | Même source d'observations, rappel filtré par opérateur et époque via les services GenOS de production |
| `synthesis_only` | Synthèse affine, consolidation et interpréteur existants, sans LLM |
| `hybrid` | Rappel GenOS et même synthèse ; exécution d'une procédure affine admise, sinon réponse du LLM ou abstention pour opérateur absent |

Le filtrage du rappel est une politique explicite du banc, construite au-dessus
de `ontogenesis/memoryService` et `AdaptiveStateService`. Ces services stockent
et restaurent réellement les observations avec provenance dans une base SQLite
isolée. Le résultat ne qualifie pas à lui seul l'ensemble des mémoires GenOS ou
l'orchestrateur autonome.

La consolidation de l'outil porte sur des replays du candidat vérifiés sur les
observations ; elle ne transforme pas les réponses ratées du LLM en succès.

Chaque monde reçoit cent observations supervisées communes, sans cent tentatives
d'action du LLM. Les six mondes ont des seeds indépendantes. Cinq contrôles ont
lieu à 0, 16, 40, 64 et 100 observations, sur douze questions chacun. Les quatre
variantes LLM font chacune un appel réel par question ; la synthèse seule n'en
fait aucun. L'hybride conserve aussi la réponse du modèle quand un outil la remplace.

Le modèle est `qwen2.5-coder:7b`, digest de catalogue
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`, servi par Ollama
local. Les quatre variantes partagent instruction, seed par question, température
zéro, plafond de 8 192 tokens de contexte et 128 tokens de sortie. Les coûts
réels diffèrent avec la quantité d'information et sont publiés séparément.
L'échauffement technique demande seulement un JSON de disponibilité et précède
le scellement ; il ne contient aucun problème expérimental.

## Nouveauté, changement et ignorance

La classe publique contient les fonctions affines, quadratiques et à charnière
`a*x+b+c*max(0,x-5)`, avec coefficients entiers de −3 à 3. Quatre opérateurs sont
observés régulièrement. L'un change de règle à l'épisode 61, dans une nouvelle
époque publiquement indiquée. Un cinquième n'est observé qu'à quatre reprises
sur la même entrée ; le sixième ne l'est jamais.

Les questions comprennent quatre nouvelles entrées, quatre compositions,
deux questions sur le cinquième opérateur et deux sur le sixième. Elles sont
disjointes entre contrôles. Leurs entrées proviennent d'une permutation de la
même plage 100–199, afin de ne pas accroître systématiquement la difficulté
arithmétique au fil de l'apprentissage.

L'oracle énumère dans un autre processus les fonctions publiques compatibles
avec les observations de l'époque. Une question est identifiable si elles
donnent toutes le même résultat. L'ignorance peut ainsi venir d'une absence
d'observation ou d'une ambiguïté malgré des observations. Les méthodes ne
reçoivent ni coefficients privés, ni étiquette d'identifiabilité, ni score de
test. Les prédictions sont journalisées avant leur notation et aucun retour
réservé n'est appris.

La reconnaissance de la cause est évaluée par rapport à l'historique commun
du monde. La variante sans mémoire n'a pas accès à cet historique ; son taux
d'abstention et sa capacité à nommer la cause précise doivent donc être lus
séparément. Une réponse devinée numériquement juste sur une question ambiguë
ne compte pas comme une résolution justifiée.

## Mesures et décisions prévues

Les deux contrastes primaires au contrôle 100 sont fixés : mémoire GenOS contre
historique brut, hybride contre synthèse seule. Le taux utile porte sur les
huit questions numériques de chaque contrôle, à dénominateur fixe. Une réponse
doit être valide, acceptée, exacte et identifiable pour être créditée. Les
questions devenant identifiables au fil des observations sont signalées à part.

Le gain moyen doit atteindre dix points. Le test exact des signes appariés
utilise les six mondes comme répétitions, avec différences nulles omises et
seuil unilatéral de 0,025 pour chacun des deux contrastes. Les questions d'une
même règle ne sont pas assimilées à des expériences indépendantes. Six mondes
offrent une puissance limitée ; les différences par monde restent publiées.

Les courbes temporelles, couvertures, abstentions inutiles, réponses confiantes
non justifiées et origines des réponses sont descriptives. Le Brier enregistré
porte sur la réussite opérationnelle justifiée ; il est distingué d'un Brier
de correction numérique dans l'analyse complémentaire. Les deux événements
peuvent différer lorsqu'une réponse devinée est juste malgré l'ambiguïté.

Les erreurs de format restent des échecs. Une analyse de sensibilité éventuelle
au seul champ `missing` omis ne remplace ni les scores enregistrés ni les tests
primaires. Le banc conserve aussi les erreurs natives remplacées par l'outil
dans l'hybride. Aucun transport réussi ou rejeu cohérent ne constitue un
résultat expérimental positif à lui seul.

Un [script diagnostique séparé](../../scripts/experiments/diagnose_competence_five_arms.cjs)
prévoit huit appels après la campagne : deux fonctions affines nouvelles,
présentées avec exemples JSON, exemples en prose, règle explicite ou calcul
arithmétique direct. Ce plan est consigné sous
`decision-a70aa8e9-288a-4467-a3ef-8fb0a7b17eb7` avant ces huit appels. Il est
postérieur aux premiers résultats de la campagne et reste une analyse post hoc,
sans nouveau test de succès ni substitution aux scores enregistrés. La condition
arithmétique change aussi l'instruction système : elle ne mesure pas le seul
effet du format. Deux cas ne permettent qu'un diagnostic descriptif.

## Résultats et analyse

La campagne réalise exactement **1 440 appels LLM** et **1 800 prédictions**,
pour 600 observations d'entraînement au total. Elle dure 2 207,045 secondes,
soit environ 36 min 47 s. Les compteurs natifs totalisent 1 202 941 tokens
d'entrée et 62 980 de sortie. Aucune erreur de transport, aucun arrêt par
limite de sortie et aucun dépassement de budget de tokens n'est observé.

### Contrôle final après cent observations par monde

Les six mondes fournissent 48 questions numériques et 24 questions non
identifiables par variante à ce contrôle. La cause précise de l'abstention
fait partie de la mesure de reconnaissance.

| Variante | Résolutions exactes et justifiées | Lacunes reconnues avec leur cause | Réponses confiantes non justifiées | Sorties finales valides |
| --- | ---: | ---: | ---: | ---: |
| Sans mémoire | 0/48 | 4/24 | 0/24 | 72/72 |
| Historique brut | 0/48 | 0/24 | 7/24 | 55/72 |
| Rappel GenOS | 0/48 | 2/24 | 11/24 | 70/72 |
| Synthèse seule | 18/48 | 24/24 | 0/24 | 72/72 |
| Hybride | 18/48 | 24/24 | 0/24 | 72/72 |

La variante sans mémoire s'abstient sur toutes les questions, dont les 24
lacunes ; son faible score de cause précise ne signifie pas qu'elle hallucine.
Avec rappel GenOS, 35 questions identifiables reçoivent une réponse acceptée,
mais aucune n'est exacte. La synthèse et l'hybride répondent exactement à leurs
18 questions acceptées et s'abstiennent inutilement sur 30 autres questions
identifiables. Les règles quadratiques et à charnière dépassent leur outil affine.

| Contraste primaire | Gains par monde | Gain moyen | Test des signes unilatéral | Verdict prévu |
| --- | --- | ---: | ---: | --- |
| Rappel GenOS − historique brut | 0, 0, 0, 0, 0, 0 | 0 point | p = 1 | Non confirmé |
| Hybride − synthèse seule | 0, 0, 0, 0, 0, 0 | 0 point | p = 1 | Non confirmé |

Les seuils n'ont pas été modifiés. L'absence de gain observé dans ce dispositif
ne démontre pas l'absence de bénéfice dans toute autre tâche ou avec un autre
modèle. Elle interdit d'attribuer ici une amélioration de compétence au rappel
GenOS ou à l'ajout du LLM au solveur affine.

### Courbes et reconnaissance des limites

Chaque cellule ci-dessous est un nombre de réponses exactes et justifiées sur
48 questions numériques. Les questions sont nouvelles à chaque contrôle ; il
s'agit de courbes sur une distribution commune, pas du rejeu des mêmes items.

| Variante | 0 | 16 | 40 | 64 | 100 observations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sans mémoire | 0 | 0 | 0 | 0 | 0 |
| Historique brut | 0 | 0 | 0 | 0 | 0 |
| Rappel GenOS | 0 | 0 | 0 | 0 | 0 |
| Synthèse seule | 0 | 0 | 18 | 6 | 18 |
| Hybride | 0 | 0 | 18 | 6 | 18 |

La synthèse retrouve un sous-ensemble de procédures après des observations
discriminantes, perd de la couverture juste après le changement d'époque, puis
la récupère. Les entrées d'apprentissage régulières cyclent sur −2, −1, 0, 1, 2
et 7 : les cent observations comprennent des répétitions. Ce test ne prouve pas
que cent observations sont nécessaires ou que chaque observation améliore le score.

À l'étape 16, la synthèse et l'hybride produisent chacun 30 réponses sur des
questions encore ambiguës. Dix-huit ont une confiance d'au moins 0,8 ; six de
ces dix-huit réponses sont aussi numériquement fausses dans le monde réel.
Les autres peuvent être justes sans que les exemples permettent de les justifier.
La confiance fondée sur le seul support affine n'identifie donc pas toute
l'incertitude relative à la classe publique plus large.

Après le changement d'époque, les 18 questions contenant l'opérateur changé
ne sont pas encore identifiables à l'étape 64. L'historique brut en reçoit 16
réponses non justifiées, le rappel GenOS 11, les deux variantes à outil zéro.
Aucune réponse observée n'est exactement l'ancienne solution : les traces ne
permettent donc pas d'attribuer ces erreurs à une simple réutilisation de la
vieille règle. Le filtrage d'époque aide à limiter ces réponses, sans gain exact.

Au contrôle 100, l'hybride exécute 18 réponses d'outil, s'abstient par contrôle
d'absence d'opérateur dans 12 cas et utilise le LLM en repli dans 42 cas. Aucune
de ses résolutions justifiées ne vient de ce repli. Les 24 causes de lacune sont
correctes à la fin, mais cette réussite finale ne doit pas masquer la surconfiance
observée plus tôt.

### Formats, coût et calibration

| Variante | Appels LLM | Tokens d'entrée | Tokens de sortie | Réponses natives valides |
| --- | ---: | ---: | ---: | ---: |
| Sans mémoire | 360 | 126 435 | 16 865 | 360/360 |
| Historique brut | 360 | 578 667 | 15 189 | 312/360 |
| Rappel GenOS | 360 | 241 601 | 15 349 | 353/360 |
| Synthèse seule | 0 | 0 | 0 | Sans objet |
| Hybride | 360 | 256 238 | 15 577 | 345/360 |

Le rappel filtré consomme environ **58,25 % de tokens d'entrée en moins** que
l'historique complet. Il améliore aussi la validité du contrat JSON dans ces
appels. Ce sont des bénéfices opérationnels observés, qui ne se traduisent pas
ici en réussite numérique. Les temps cumulés d'appels natifs sont respectivement
480,150 s, 652,584 s, 504,178 s et 496,154 s pour les quatre variantes LLM ; ils
incluent l'attente éventuelle du service partagé et ne chronomètrent pas tout
le travail des outils. Le coût monétaire n'a pas été estimé.

Il existe 70 réponses natives invalides sur 1 440. Ces erreurs de contrat restent
des échecs, même lorsque l'hybride les remplace par un résultat d'outil. Une
sensibilité post hoc qui complète uniquement `missing=[]` lorsqu'il est le seul
champ omis laisse les scores finaux inchangés : 0, 0, 0, 18 et 18. Le problème
ne se réduit donc pas à cette omission de champ.

Le Brier opérationnel final vaut 0 pour l'abstention totale sans mémoire,
0,305556 pour l'historique brut, 0,638889 pour le rappel GenOS et 0,007813 pour
les deux variantes à outil. Le zéro d'abstention ne constitue pas une compétence.
L'analyse complémentaire publie aussi la correction numérique, les réponses
devinées justes et les dénominateurs. Aucun mécanisme de calibration du LLM
n'est appris ici à partir d'erreurs de décision : les observations sont passives.

### Diagnostic complémentaire : application de la tâche

Dans le premier monde, le rappel GenOS fournit 24 observations pour un opérateur,
dont `(-2, -3)`, `(-1, 0)`, `(0, 3)`, `(1, 6)`, `(2, 9)` et `(7, 24)`. La règle
est identifiable : `3x+3`. À l'entrée 159, le LLM répond **24 avec confiance 1**,
au lieu de 480. Il fournit une valeur observée sans réussir l'application à
l'entrée nouvelle. Ce cas est conservé dans `five-arm-validation/case-study.json`.

Les huit sondes prévues après campagne ont toutes été exécutées avec le même
modèle et sans réessai. Les cibles sont `2*137+1=275` et `3*173-2=517`.

| Présentation diagnostique | Réponses exactes | Champs numériques exacts, même sans contrat complet |
| --- | ---: | ---: |
| Exemples JSON | 0/2 | 0/2 |
| Mêmes exemples en prose | 0/2 | 0/2 |
| Règle explicite dans le cadre des opérateurs | 0/2 | 0/2 |
| Calcul arithmétique posé directement | 2/2 | 2/2 |

Le changement en prose ne suffit pas dans ces deux cas. La règle explicite
dans le contexte d'opérateurs conduit à recopier l'entrée, 137 ou 173 ; le calcul
direct réussit. Cela suggère un problème d'interprétation ou d'application de
la tâche sous cette instruction, auquel s'ajoutent des erreurs d'induction.
Ce diagnostic ne démontre pas une incapacité générale en calcul, ni une cause
interne unique du modèle. Le test présente un effet de plancher pour les trois
variantes sans exécution d'outil : elles ne permettent pas d'estimer un gain de
raisonnement lorsque le prédicteur échoue déjà à appliquer une règle explicite.

Avant une nouvelle comparaison, un contrôle positif d'application d'une règle
connue devrait donc être fixé et réussi sur des cas de développement distincts.
Une représentation ou un contrat de sortie corrigés exigeraient une nouvelle
campagne scellée ; aucune correction n'a été réinjectée dans ces résultats.

## Provenance et audit

- Dossier réel : `D:\genos-competence-results\five-arms\7080cb22-f1b6-4702-837e-cad56f28e3f8`.
- Manifeste : `fbdf77c2ba392ca9c2fb43e5042e076cdee279ca4c5e6c0ad0d28051e462ad4d`.
- Logs : `D:\genos-competence-results\five-arm-validation`.
- Snapshot de départ : `snap-ccf3bedb92194ecf801d9120c87870ed`.
- Décision avant campagne : `decision-1cd7f5fa-be5f-48e2-9206-fbf9808fe7ed`.
- Décision après analyse : `decision-9745c9a7-184b-4524-b656-6ece6089ec25`.
- Diagnostic : `D:\genos-competence-results\five-arm-diagnostics\e38baf06-7487-407a-a32c-1a1b7eb8930d`.
- Manifeste diagnostique : `28acb0ed4796552dd87a999596033f664859e7ab0fc27b3bc0be6c904e0201d8`.
- Analyses et courbes : `analysis-extra.json`, `learning-curves.png` et `learning-curves.svg` dans le dossier de campagne.

L'archive conserve sources, observations, requêtes, réponses natives, réponses
finales, journal chaîné, mesures et base isolée. Les sources nommées dans le
manifeste sont scellées. Un audit supplémentaire des dépendances transitives
récupère les fichiers propres depuis la révision Git du manifeste, puis compare
les contenus normalisés : ce supplément est distinct du scellement initial.
Les empreintes initiales tiennent compte des fins de ligne ; les copies archivées
doivent être préservées pour éviter un refus dû à une conversion LF/CRLF.

À chaque contrôle, un autre processus restaure la mémoire et vérifie son
empreinte. Les empreintes après questions doivent rester identiques. Le rejeu
JavaScript contrôle notamment l'absence d'observations futures dans les contextes.
La contre-vérification Python réimplémente l'oracle et les mesures. Ces deux
implémentations appartiennent au même expérimentateur ; aucune indépendance
de laboratoire n'est revendiquée. La tentative de revue autonome GenOS a expiré
après 120 secondes et ne constitue pas une critique externe validée.

```powershell
node benchmarks/competence-five-arms/test.cjs
node benchmarks/competence-five-arms/verify.cjs D:\genos-competence-results\five-arms\7080cb22-f1b6-4702-837e-cad56f28e3f8 fbdf77c2ba392ca9c2fb43e5042e076cdee279ca4c5e6c0ad0d28051e462ad4d
python benchmarks/competence-five-arms/crosscheck.py D:\genos-competence-results\five-arms\7080cb22-f1b6-4702-837e-cad56f28e3f8
```

## Vérifications exécutées

Les neuf tests ciblés passent : ambiguïté, changement d'époque, insuffisance
du solveur affine, persistance réelle, restauration dans un autre processus,
absence d'observations futures et unité statistique par monde. Les rejeux
JavaScript et Python sortent avec le code zéro et concordent sur les 1 800
prédictions, les 360 oracles distincts et les deux contrastes primaires.
L'audit SQLite en lecture seule retrouve exactement cent observations par
monde, soit 600 au total, et six états persistés dont les empreintes concordent.

Le contrôle qualité initial vérifie 8 878 fichiers sans nouvelle violation ;
le contrôle final en vérifie 8 926, toujours sans nouvelle violation. Les liens
relatifs sont valides. L'index ADR initial passe avec 933 fichiers et 933 lignes ;
le contrôle final du checkout partagé trouve cinq nouveaux documents datés non
indexés, hors du périmètre de cette expérience (`adr-index-final.log`). L'entrée
0792 reste unique et présente. Les sources nommées et le modèle
restent inchangés, les budgets sont respectés et les affectations sont complètes.
L'indicateur `allNativeResponsesValid` demeure faux à cause des 70 réponses
invalides ; aucun statut de validité intégrale des sorties natives n'est revendiqué.

Les contrôles globaux du checkout partagé ne sont pas tous verts :

- `npm test` : deux premiers refus pour verrou détenu par un autre processus.
  La troisième tentative exécute la suite et échoue sur
  `test_hachimoji_catalog.cjs`, avec `Qualification source drift` ; la biologie
  passe 10 tests sur 11. Le calcul de cette empreinte exclut les fichiers de
  cette expérience, et `hachimojiCatalog.js` est alors modifié dans le checkout.
  Après actualisation de la qualification, la quatrième tentative est à nouveau
  refusée par le verrou. La correction de l'empreinte ne vaut pas réussite de
  la suite globale. Journaux : `npm-test.log`, `npm-test-retry.log`,
  `npm-test-attempt-3.log` et `npm-test-attempt-4.log`.
- `cargo test --workspace` : échec du contrôle de copie binaire dans
  `crates/genos-cli/tests/helpers/rust_llm_fixture.rs:75`, avant le cas sémantique
  `semantic_requirements_remain_unresolved_even_when_all_literals_match`.
  La relance ciblée dans le même répertoire partagé échoue avec accès refusé
  sur `genos.exe`, ce qui étaye le conflit d'utilisation du binaire. Les sources
  de ce test ne sont pas modifiées par cette expérience. Une recompilation
  globale isolée sur `D:` est commencée puis interrompue pour limiter le diagnostic
  au seul cas en échec ; elle n'est pas comptée comme réussite.
  Journaux : `cargo-test.log`, `cargo-failed-case-retry.log` et `cargo-test-isolated.log`.
- Relance ciblée dans le répertoire isolé : **réussie**, un test passé et huit
  autres non sélectionnés, en 18,38 secondes après compilation.
  `cargo-case-isolated.log` conserve la commande et le résultat. Cela étaye le
  diagnostic du conflit de binaire partagé ; la suite Rust globale entière
  n'est pas déclarée réussie.

Tous ces journaux restent sous `D:\genos-competence-results\five-arm-validation`.
Les erreurs des suites globales sont conservées et ne sont pas effacées par les
rejeux réussis de l'expérience. Aucun fichier modifié par un autre travail n'est
inclus dans le commit de cette expérience.

## Limites de portée

L'expérience reste conditionnelle à une classe publique connue, un modèle et
six mondes générés. Elle n'établit pas une compétence universelle ou une
modification des poids. Le contraste mémoire-historique concerne un rappel
filtré ; le contraste hybride-synthèse ajoute conjointement rappel et recours
au LLM. La synthèse ne cherche que les règles affines et n'est donc pas un
solveur optimal de toute la classe publique. Les observations sont passives,
sans stratégie autonome d'exploration.

Les plafonds sont égaux pour les variantes LLM, mais l'information et le coût
réels diffèrent. L'ordre est mélangé et le service local peut être partagé :
les temps observés ne constituent pas un benchmark matériel indépendant.
Aucune promotion, modification de bail ou interface de production n'est autorisée.
