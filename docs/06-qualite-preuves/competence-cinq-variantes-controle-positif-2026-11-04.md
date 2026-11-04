# Application des règles corrigée : contrôle positif puis cinq variantes

- **Date et dernière revue** : 2026-11-04.
- **Statut** : contrôle positif validé ; campagne complète et auditée ; contrastes primaires non soutenus.
- **Portée** : programmes proposés par Qwen réel, interpréteur commun, classe de fonctions publique bornée.
- **Promotion runtime** : aucune.

## Correction et question mesurée

La [première comparaison](competence-cinq-variantes-2026-11-04.md) produisait un
effet de plancher : zéro résolution numérique pour les trois variantes sans
exécution d'outil. Une règle explicite dans le même cadre ne suffisait pas,
alors qu'un calcul arithmétique posé directement réussissait.

Le [nouveau banc](../../benchmarks/competence-five-arms-v2/README.md) sépare
l'induction de la règle de son application. Le LLM propose des objets typés
`op`, `epoch`, `kind`, `a`, `b`, `c`. Un contrat local vérifie la forme, le contexte
et la cohérence avec les observations. Un interpréteur commun calcule ensuite
l'expression publique. Il ne calcule pas les coefficients d'un programme LLM
à la place du modèle. La source d'une réponse est publiée comme programme LLM
validé, synthèse affine, refus structurel ou abstention du modèle.

Les règles explicitement fournies au contrôle sont d'abord filtrées par
opérateur et époque, puis rendues avec leurs champs typés. Le schéma de sortie
contraint les noms autorisés et les paramètres, sans imposer les bons coefficients.
Une proposition rejetée peut recevoir une seule correction LLM. Le témoin
contient uniquement une entrée d'entraînement, sa valeur observée et la valeur
prédite par la proposition rejetée. Aucun résultat de question réservée ne
revient au modèle. Ces choix sont décrits dans l'[ADR 0794](../adr/0794-application-regles-typees-et-controle-positif.md).

L'interpréteur accepte les fonctions affines, quadratiques et à charnière,
avec coefficients entiers de −3 à 3, profondeur au plus seize et valeurs
bornées à `10^12`. Aucun `eval` ou code généré arbitraire n'est exécuté.

## Essais de développement conservés

Deux petits essais ont précédé le contrôle indépendant. Ils ne sont pas des
preuves de succès et leurs jeux ne sont pas réutilisés pour la campagne.

| Essai | Cas d'application avec règles fournies | Induction depuis des exemples | Appels natifs |
| --- | ---: | ---: | ---: |
| Développement 1 | 3/4 | 1/4 | 8 |
| Développement 2 | 4/4 | 0/4 | 12 |

Dans le premier, le modèle reprenait un coefficient de l'ancienne époque pour
un programme quadratique. Le filtrage des règles fournies et leur représentation
typée ont corrigé cette ambiguïté de présentation. La vérification par exemples
et un témoin de rejet ont aussi été ajoutés, avec un plafond fixe de deux
propositions. Les quatre échecs d'induction du second essai restent visibles :
la correction d'application ne constitue pas une preuve que l'induction réussira.

- Développement 1 : `D:\genos-competence-results\rule-application-controls\f8084614-742d-4fcf-8e77-6d652e691460`.
- Manifeste : `32d67fe804d457dfea46ca6e7f248791ca9ac82d15300910f3d9b1994df5d30c`.
- Développement 2 : `D:\genos-competence-results\rule-application-controls\183573dc-c5a8-44cc-9033-ba75553b1c2e`.
- Manifeste : `c4ee113bb32dfcc91d54984408dbb36a4077354a02816dc62492c019af2000ad`.

## Contrôle positif indépendant avant lancement

Le critère est fixé avant l'exécution : **seize cas exacts sur seize**, seize
sorties finales valides, budgets respectés, modèle et sources inchangés. Les
cas ont des noms et seeds nouveaux ; ils couvrent les trois familles et quatre
compositions, avec règles et contextes explicitement fournis. Un échec aurait
interdit le lancement. Le programme ne relance pas une série scellée après
adaptation ; ses seules corrections possibles sont les deux propositions
prévues dans le pipeline.

Le contrôle réussit **16/16 en seize appels LLM natifs**, sans correction
additionnelle. Toutes les sorties et tous les budgets sont valides, le modèle
et les quarante fichiers de source sont inchangés. Le rejeu du contrôle
recalcule les sorties et vérifie les requêtes, réponses natives et schémas.

- Dossier : `D:\genos-competence-results\rule-application-controls\0c261570-c33c-44ed-9b96-fcf8ea094a51`.
- Manifeste : `3a89277a565b89158ffed52eb6039321d343bdae2e5cb32dfd657798481e0fe5`.
- Décision préalable : `decision-e18a36b3-983e-4631-b335-2b0c35e276f5`.
- Décision après vérification : `decision-58d295c5-db3d-42fe-b569-f686b0a70653`.
- Journal : `D:\genos-competence-results\five-arm-v2-validation\positive-control-verification.log`.

Ce contrôle valide l'application **du système outillé** lorsque les règles sont
connues. Le LLM fournit réellement les objets de programme, puis l'interpréteur
les exécute. Il ne démontre ni calcul numérique natif fiable du modèle ni
induction depuis des données inconnues. Les règles fournies du contrôle ne
sont jamais injectées dans les requêtes primaires.

## Campagne prospective gelée

Le lancement relit le contrôle, compare les sources et le modèle, puis génère
seulement les seeds des six mondes. Les cent observations par monde, cinq étapes
et douze questions par étape restent ceux du banc précédent, avec des mondes
nouveaux. Les entrées observées répètent six valeurs ; cent observations ne
signifient pas cent découvertes distinctes. Les questions réservées sont disjointes
et aucun retour de leur oracle n'est appris.

| Variante | Rappel et proposition | Calcul final |
| --- | --- | --- |
| Sans mémoire | Question sans observations, LLM avec schéma commun | Même interpréteur si programme admis |
| Historique brut | Historique complet avec époques étiquetées, même LLM | Même interpréteur |
| Rappel GenOS | Observations pertinentes rappelées via les services de mémoire de production, même LLM | Même interpréteur |
| Synthèse seule | Synthèse affine de production sur les observations | Interpréteur affine existant, sans LLM |
| Hybride | Rappel GenOS et même proposition affine ; LLM si nécessaire | Outil affine si complet, sinon programme LLM validé |

Les quatre variantes LLM appellent le modèle à chacune des 1 440 questions,
même si l'hybride utilise ensuite un résultat d'outil. Un programme cohérent
avec les exemples est exécuté sans correction ; un programme contradictoire
peut recevoir une deuxième proposition, au plus. Il y a donc au plus 2 880
appels natifs, dont les coûts sont additionnés, sous un plafond de 90 minutes.
Le contexte est plafonné à 8 192 tokens et chaque proposition à 384 tokens.

Le filtre opérateur/époque est une politique du banc, au-dessus des services
GenOS qui assurent réellement stockage, provenance et restauration. Ce test
ne qualifie pas toutes les politiques de rappel ou l'orchestrateur complet.

Le modèle est `qwen2.5-coder:7b`, digest
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`,
servi localement par Ollama, température zéro et seed par question. Ses poids
restent fixes. La mémoire est réellement persistée et restaurée à chaque
contrôle dans un autre processus. Les états sont comparés après les questions
pour vérifier leur absence d'apprentissage réservé.

Les programmes LLM doivent être cohérents avec toutes les observations du
contexte courant. Les refus pour absence de données et moins de trois entrées
distinctes sont structurels et sont mesurés séparément. La cohérence ne prouve
pas l'unicité dans toute la classe publique : l'oracle séparé continue de
détecter l'ambiguïté lorsqu'une autre famille donne une réponse différente.

Les contrastes primaires restent rappel GenOS contre historique brut et hybride
contre synthèse seule. Le taux utile porte sur huit questions numériques fixes
par contrôle et monde, avec exactitude et identifiabilité requises. Chaque gain
moyen doit atteindre dix points et le test exact des signes apparié par monde
doit donner `p ≤ 0,025`. Les courbes avant/après restent aussi publiées, afin de
distinguer apprentissage absolu et avantage marginal sur un autre mécanisme.

## Résultats et interprétation

La campagne se termine en **54,75 minutes**, avec **1 800 prédictions**, 600
observations persistées, 1 440 questions LLM et **1 814 appels natifs**. Les
374 propositions supplémentaires sont les corrections prévues. Toutes les
affectations, sorties natives finales, limites de tokens, restaurations et
empreintes de sources/modèle passent. Aucun transport n'échoue et aucune
sortie n'est arrêtée pour longueur. Le maximum observé par proposition est
3 113 tokens d'entrée et 172 de sortie. La validité syntaxique ne signifie
pas que les coefficients sont corrects.

### Après cent observations

Chaque variante reçoit 48 questions numériques identifiables et 24 questions
non identifiables, réparties sur les six mondes.

| Variante | Résolutions utiles | Taux | Lacunes reconnues avec bonne raison | Refus sur questions identifiables |
| --- | ---: | ---: | ---: | ---: |
| Sans mémoire | 0/48 | 0 % | 12/24 | 48/48 |
| Historique brut | 0/48 | 0 % | 24/24 | 48/48 |
| Rappel GenOS | 1/48 | 2,08 % | 24/24 | 47/48 |
| Synthèse seule | 18/48 | 37,50 % | 24/24 | 30/48 |
| Hybride | 18/48 | 37,50 % | 24/24 | 30/48 |

L'unique réussite finale de GenOS est une composition de deux programmes
affines, proposée correctement dès le premier appel dans un seul monde.
Les dix exécutions de programmes LLM de toute la campagne sont affines :
neuf sont encore non identifiables à l'étape 16 ; seule cette composition
finale satisfait à la fois exactitude et justification. Aucun programme
quadratique ou à charnière inféré par le LLM n'est admis. Les dix-huit
réussites finales hybrides viennent toutes de l'outil affine, sans réussite
supplémentaire issue du LLM.

| Contraste préenregistré | Gain moyen | Différences par monde, en points | Test exact unilatéral | Critère atteint |
| --- | ---: | --- | ---: | --- |
| GenOS − historique brut | +2,08 points | 0 ; 0 ; 0 ; 12,5 ; 0 ; 0 | p = 0,5 | Non |
| Hybride − synthèse seule | 0 point | 0 ; 0 ; 0 ; 0 ; 0 ; 0 | p = 1 | Non |

**L'application de règles fournies est validée pour ce pipeline ; le gain
de compétence recherché n'est pas démontré.** La réussite isolée de GenOS
reste sous le seuil pratique de dix points et ne se reproduit pas dans les
six mondes. La composante LLM n'ajoute rien à la synthèse dans l'hybride.
Ce résultat ne démontre pas non plus l'impossibilité d'un gain avec d'autres
modèles, tâches ou procédures d'apprentissage.

### Courbe d'apprentissage et limites épistémiques

Les nombres ci-dessous portent toujours sur 48 questions numériques par étape.

| Observations | Sans mémoire | Historique brut | GenOS | Synthèse seule | Hybride |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0 | 0 | 0 | 0 |
| 16 | 0 | 0 | 0 | 0 | 0 |
| 40 | 0 | 0 | 0 | 18 | 18 |
| 64 | 0 | 0 | 0 | 6 | 6 |
| 100 | 0 | 0 | 1 | 18 | 18 |

Le gain descriptif avant/après est donc nul pour l'historique, +2,08 points
pour GenOS et +37,50 points pour les deux variantes utilisant la synthèse.
Ce dernier gain est commun au contrôle sans LLM. Le recul à l'étape 64 suit
le changement public d'époque à 61 : les observations de l'ancienne règle
ne suffisent plus pour justifier la nouvelle. Ces observations avant/après
ne remplacent pas les deux tests primaires.

La prudence finale ne s'étend pas à toutes les étapes. À 16 observations,
sur 66 questions non identifiables, l'historique donne une réponse de haute
confiance injustifiée, GenOS en donne huit, la synthèse et l'hybride dix-huit
chacun. Les trois entrées distinctes suffisent parfois à ajuster une droite,
mais restent toutes sous la charnière : plusieurs programmes publics
coïncident sur ces entrées et divergent hors échantillon. Une vérification
de cohérence ne prouve donc pas l'unicité. Le modèle ne reconnaît pas toujours
cette ignorance, et le garde-fou minimal ne la détecte pas entièrement.

À l'étape 100, les 24 lacunes correctement reconnues par GenOS sont des
refus structurels : douze pour données insuffisantes et douze pour absence
de données. Les 47 refus sur des questions pourtant identifiables sont
43 abstentions du modèle et quatre programmes encore rejetés. La
reconnaissance finale des lacunes ne constitue donc pas une introspection
apprise du LLM, et son coût en couverture reste très élevé.

### Coûts et effet de la correction

| Variante | Questions LLM | Appels natifs | Corrections | Tokens d'entrée | Tokens de sortie |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sans mémoire | 360 | 360 | 0 | 228 420 | 18 045 |
| Historique brut | 360 | 495 | 135 | 840 465 | 48 524 |
| Rappel GenOS | 360 | 526 | 166 | 511 211 | 56 118 |
| Synthèse seule | 0 | 0 | 0 | 0 | 0 |
| Hybride | 360 | 433 | 73 | 422 272 | 40 087 |

Le total est de 2 002 368 tokens d'entrée et 162 774 de sortie, hors contrôle
positif et développement. GenOS consomme ici 39,18 % de tokens d'entrée de
moins que l'historique, corrections comprises, mais effectue davantage
d'appels. Cela décrit un coût observé et ne démontre pas un avantage de
compétence ou de performance sous toutes les conditions.

Parmi les 374 corrections, 306 aboutissent à une abstention du modèle,
46 à un programme encore rejeté et 21 à une réponse finalement déterminée
par l'outil hybride. Une seule aboutit à un programme LLM admis, mais sa
question reste ambiguë et sa réponse est fausse : **aucune correction ne
produit une résolution utile supplémentaire**. Les propositions non
abstentionnistes contradictoires avec les observations et de confiance au
moins 0,8 sont au nombre de 151 pour l'historique, 188 pour GenOS et 75
pour l'hybride. Ce sont des propositions, pas autant de questions distinctes.

Les résultats révèlent ainsi deux échecs différents : mauvaise induction
malgré des données suffisantes, et assurance excessive lorsque plusieurs
règles restent possibles. Le contrôle positif isole la réussite de
l'application lorsque la règle est connue ; il ne résout aucun de ces deux
problèmes. Une suite éventuelle devra valider séparément un contrôle
d'induction et un contrôle d'ambiguïté, avant une nouvelle campagne scellée.

## Localisation des échecs

Une trace conservée du premier monde, étape 100, concerne l'opérateur
`op_fbae689e` à l'entrée 159. Les observations comprennent `(-2,-2)`, `(-1,0)`,
`(0,2)`, `(1,4)`, `(2,6)` et `(7,16)` : la règle est `2x+2` et la réponse
réservée est 320. Le LLM propose pourtant un programme quadratique `x²+2x`,
avec confiance 1. Le validateur produit le témoin public `x=-2`, valeur
observée −2, valeur prédite 0. La deuxième proposition conserve le mauvais
programme, mais déclare une abstention et une confiance nulle. La réponse
finale est donc une abstention du modèle, sans exécution numérique.

Cette trace distingue trois faits : la syntaxe est valide, l'induction est
fausse, et le contrôle de cohérence empêche son application. Elle ne suffit
pas à mesurer la fréquence de chaque cause dans toute la campagne ; les
compteurs agrégés complètent ce diagnostic. Le témoin de correction n'utilise
jamais la réponse 320, qui reste réservée à l'évaluation.

| Explication envisagée | Observation discriminante | Conclusion bornée |
| --- | --- | --- |
| Transport ou JSON défaillant | 1 814 propositions valides, aucune erreur de transport | N'explique pas l'échec mesuré de cette campagne |
| Sortie coupée ou plafond de contexte dépassé | Aucun arrêt pour longueur ; maxima 3 113/172 contre plafonds 8 192/384 | Aucun dépassement observé ; cela ne mesure pas les limites cognitives du modèle |
| Mémoire non persistée ou mauvaise restauration | 600 observations, six états finaux, empreintes vérifiées à chaque étape | La perte matérielle de ces observations n'est pas observée |
| Mauvaise application d'un programme connu | Contrôle fourni 16/16 ; dix exécutions primaires recalculées en Python | L'interpréteur applique correctement ces programmes ; cela ne prouve pas leur justification |
| Mauvaise induction malgré les exemples | Coefficients contradictoires, témoins publics, aucune correction utile | Goulet directement observé avant l'exécution |
| Ambiguïté mal reconnue | Réponses confiantes à l'étape 16 malgré plusieurs fonctions compatibles | La cohérence seule ne suffit pas à connaître ses limites |

Ces observations localisent des défaillances ; elles n'isolent pas causalement
les contributions de la taille du modèle, du prompt, du schéma et de la
représentation des données. Les modifier demanderait une nouvelle expérience.

L'absence de réponse confiante injustifiée n'implique pas une compétence
élevée. Un système qui refuse toutes les questions obtient aussi zéro erreur
de ce type. De même, le Brier publié mesure la réussite effective de la réponse,
avec confiance zéro en cas d'abstention : un refus systématique peut obtenir
zéro sans résoudre une seule tâche. Il faut lire simultanément exactitude
utile, couverture, refus inutiles, source du refus et reconnaissance des lacunes.

La mémoire rend ici des observations accessibles au modèle ; elle ne garantit
pas qu'il en extraira les coefficients corrects. L'interpréteur corrige le
problème d'application seulement après admission d'une règle. La synthèse
affine peut réussir directement sur sa classe, et ses réponses doivent rester
attribuées à cet outil. Ces étapes ne sont pas interchangeables dans une
affirmation d'apprentissage ou de connaissance de ses limites.

## Sources et audits

- Campagne : `D:\genos-competence-results\five-arms-v2\89585992-5af7-4fd0-bc2a-e843d60ec290`.
- Manifeste : `856db45d9ebb518be0c297d4537472ff4e6ea5e674f893a72d20010257535f73`.
- Logs : `D:\genos-competence-results\five-arm-v2-validation`.
- Snapshot de départ : `snap-5212aa520d874d98a5859bf1c38a9236`.
- Décision après audits : `decision-abeabf44-231c-4f9e-8453-92335c3e83e1` ; persistée, sans promotion.

Dans le dossier de campagne, `report.json` conserve les scores et tests,
`analysis-extra.json` les coûts et corrections, et `python-crosscheck-v2.json`
le contrôle indépendant du calcul. `learning-curves.png` et
`learning-curves.svg` montrent les deux courbes. Le contrôle en lecture seule
`persistence-and-artifact-audit.json` confirme cent observations par monde,
six états finaux à cent observations et les SHA-256 bruts des artefacts.

Chaque proposition et le témoin de correction éventuel sont conservés. Les
requêtes primaires ont toujours `providedRules=[]`. Le vérificateur JavaScript
reconstruit les contextes et les corrections depuis les seules observations
disponibles, puis recalcule programmes, calculs, affectations et statistiques.
Le [contrôle Python](../../scripts/experiments/crosscheck_typed_competence.py)
réimplémente les oracles, vérifie les applications typées et compte les propositions
natives séparément des questions. Ces deux implémentations appartiennent au
même expérimentateur et ne constituent pas une validation par laboratoire tiers.

Les sources et dépendances locales sont archivées ; leurs empreintes normalisent
CRLF en LF pour le rejeu. Les modèles, bases et autres artefacts générés restent
sur `D:`, sans être ajoutés à Git. L'usage des [sorties structurées Ollama](https://docs.ollama.com/capabilities/structured-outputs)
contraint la syntaxe ; il ne certifie pas la justesse des programmes.

```powershell
node benchmarks/competence-five-arms-v2/test.cjs
node benchmarks/competence-five-arms-v2/verify.cjs D:\genos-competence-results\five-arms-v2\89585992-5af7-4fd0-bc2a-e843d60ec290 856db45d9ebb518be0c297d4537472ff4e6ea5e674f893a72d20010257535f73
python scripts/experiments/crosscheck_typed_competence.py D:\genos-competence-results\five-arms-v2\89585992-5af7-4fd0-bc2a-e843d60ec290
```

## Vérifications et limites

Les vingt tests ciblés passent. Ils couvrent aussi la correction du cas `3x+3`
à l'entrée 159, le rejet d'un mauvais coefficient, la composition, la liaison
d'époque et l'absence de réponse réservée dans le témoin de correction.

| Vérification | Résultat constaté |
| --- | --- |
| Tests ciblés du banc | 20/20, aucune omission |
| Rejeu JavaScript complet | 1 800 prédictions, 1 814 appels, manifeste et sources vérifiés |
| Audit Python | 360 oracles uniques, scores et tests, dix calculs typés et seize contrôles positifs vérifiés |
| Persistance en lecture seule | 600 observations et six états finaux à cent observations |
| Qualité globale | 8 971 fichiers source, zéro violation au contrôle consigné |
| Documentation propre au changement | Onze liens locaux vérifiés ; ADR 0794 présent et indexé |
| `npm test` complet | Premier lancement bloqué par un autre propriétaire du verrou ; relance effective en échec sur `test_direct_worker_control_run.cjs`, `EXECUTION_AUTHORITY_EXPIRED` |
| Cas Node défaillant, relancé seul | Passe, code de sortie zéro, sans modifier le test ou les budgets |
| `cargo test --workspace` complet | Code 101 ; quatre échecs dans `agentic_hierarchical_runtime` : verrous SQLite, échéance native dépassée et trois appels au lieu de cinq |
| Même binaire Rust, quatre cas en série | 4/4, code zéro, 630,17 secondes, sans recompilation ni modification des limites |

Les journaux correspondants sont dans `five-arm-v2-validation` sur D :
`unit.log`, `javascript-verification.log`, `python-verification.log`,
`persistence-audit.log`, `quality-final.log`, `document-links.log`,
`npm-test.log`, `npm-test-attempt-2.log`, `node-direct-control-targeted.log`,
`cargo-test.log` et `cargo-hierarchy-serial-binary.log`. Le contrôle du code
stagé est conservé dans `quality-staged.log` au commit. Une tentative de
diagnostic Cargo sélectionnant d'autres options a commencé une reconstruction ;
elle a été arrêtée au profit du binaire exact de la suite initiale, conservé
dans la cible D isolée.

Les succès isolés sont compatibles avec une contention ou une sensibilité aux
délais, mais n'en établissent pas seuls la cause. **Les suites globales ne
sont pas déclarées vertes.** Les fichiers de ces échecs ne sont pas modifiés
par ce changement. Un contrôle supplémentaire de l'index ADR signalait six
documents datés non indexés dans d'autres travaux ; l'entrée propre à cet
ADR est valide. Les modifications concurrentes sont conservées et exclues
du commit de l'expérience.

Les changements de présentation, schéma, validation et interpréteur se produisent
ensemble : les différences avec les campagnes historiques ne les isolent pas
causalement. Le contrôle positif valide uniquement l'application de règles
fournies. L'observation est passive, la classe de fonctions connue et la
synthèse seule limitée aux fonctions affines. Aucun résultat ne qualifie une
compétence générale, une modification des poids ou tout l'orchestrateur GenOS.
