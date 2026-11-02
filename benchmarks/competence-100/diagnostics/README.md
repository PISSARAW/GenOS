# Comprendre l'échec sans réécrire le résultat

Ces analyses sont **post hoc et exploratoires**. Elles n'ajustent ni les seuils
ni les scores de la campagne principale. Les tâches des sondes LLM utilisent de
nouveaux alias et des données distinctes. Les sorties restent sur `D:`.

```powershell
node benchmarks/competence-100/diagnostics/test.cjs
node benchmarks/competence-100/diagnostics/analyze.cjs <campagne> <rapport-json>
python benchmarks/competence-100/diagnostics/python_crosscheck.py <campagne>
node benchmarks/competence-100/diagnostics/probes.cjs <nouveau-dossier>
node benchmarks/competence-100/diagnostics/probes.cjs <autre-nouveau-dossier> arithmetic
```

Le premier analyseur utilise uniquement les exemples publics des prompts pour
déduire `a` et `b`, vérifier leur cohérence et composer les règles. Sur l'archive
du 2 novembre : 120 réponses exactes calculables et 40 lacunes récupérées. Les
exemples étaient donc mathématiquement suffisants et le rappel n'était pas corrompu.

## Diagnostic mesuré

- La mémoire conserve cent épisodes mais le test ne réutilise que douze exemples.
  Pour les 160 tâches, les exemples rappelés après douze épisodes sont exactement
  ceux présentés après cent. Le dernier de ces exemples apparaît dans une requête
  d'entraînement à l'épisode seize. Les corrections suivantes ne modifient plus
  le contexte utile au test.
- Les 16 questions inconnues sans exemple familier sont toutes reconnues comme
  inconnues. Les 24 mélangeant opérateur connu et inconnu produisent toutes une
  réponse à haute confiance. C'est une association exhaustive dans ce monde,
  pas la preuve d'un mécanisme cognitif universel.
- Aucune des 580 réponses n'a été tronquée. Le solveur LLM échoue donc sans que
  l'explication puisse être une réponse JSON coupée par le plafond de sortie.
- Les 131 réponses fausses acceptées sont 107 erreurs sur tâches résolubles et
  24 réponses injustifiées sur tâches sous-déterminées.

## Sondes LLM nouvelles

Le serveur Ollama local réparé sert le même modèle `qwen2.5-coder:7b`, digest de
catalogue `dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
Le transport diffère du runtime Vulkan de la campagne initiale. La température
reste nulle, le contexte 4 096 et la sortie maximale 128 tokens. Chaque groupe
contient quatre tâches : ces effectifs ne permettent pas une conclusion générale.

| Condition | Correct / affecté |
| --- | ---: |
| Règle simple inférée depuis trois exemples négatifs | 0/4 |
| Même règle depuis trois exemples non négatifs | 1/4 |
| Règle simple fournie en JSON | 2/4 |
| Règle simple fournie en texte | 3/4 |
| Composition depuis les exemples | 0/4 |
| Composition avec règles JSON explicites | 0/4 |
| Composition avec règles textuelles explicites | 0/4 |
| Opérateur inconnu seul | 4/4 |
| Opérateur inconnu avec exemples d'un opérateur connu | 0/4 |
| Opérateur inconnu avec règle connue explicite | 4/4 |

Les 40 sorties sont valides. Une seconde étape exploratoire a développé les
compositions en arithmétique explicite : `(3*x + 1)*4 - 4`, sur les mêmes quatre
valeurs neuves. Résultat : **0/4**, quatre réponses valides, fausses et confiantes.
Fournir une règle n'élimine donc pas toutes les difficultés dans ces sondes :
l'induction, la présentation et le calcul direct restent à distinguer. La cause
ne peut pas être réduite à une panne de récupération mémoire ou au seul JSON.

Plans conservés avant leurs appels, SHA-256 :

- 40 sondes : `06c38161d356e057804801a9ef8a5b6c76e50d9f3ca70cc0802f267dd0c0bff4`.
- 4 sondes arithmétiques supplémentaires : `60b2d16044d5ac79a30d9cf055e40cfcca1cd52b131a35e0ba4dd1d47e764b6e`.

Les archives se trouvent sous `D:\genos-competence-results\diagnostics` :
`archive-analysis.json`, `fresh-probes-20261102/`,
`expanded-arithmetic-20261102/` et leurs logs. L'ancienne version du script des
quarante sondes est conservée dans `probes-v1.cjs` ; les cas par défaut sont
inchangés dans le script versionné.

## Cause structurelle du banc

L'inspection du code confirme que `agent.learn` écrit seulement un exemple dans
`ontogenesis_memory`. Le banc n'appelle ni `proceduralLearningCycleService`, ni
`metacognitiveForecastService`, ni `metacognitionBenchService`, ni un mécanisme
de mise à jour de la politique après erreur.

`agent.decision` transmet la confiance déclarée à `abstentionService`, avec
`uncertainty = 1 - confidence` et `integrity = 1`. Ces entrées ne constituent pas
trois observations indépendantes. Une déclaration de confiance 1 produit donc
incertitude 0 et une autorisation, même après plusieurs échecs. Le service
d'abstention n'est pas conçu pour inventer les preuves absentes de ses entrées.

Cette configuration est un modèle figé avec stockage/rappel d'exemples et une
politique statique. Elle ne valide pas une boucle complète d'apprentissage GenOS.
La limite vient à la fois du montage expérimental et du comportement du modèle
observé dans ce montage.

## Ce qu'une expérience corrigée devra tester

1. Faire produire, vérifier et conserver une règle/procédure réutilisable avec
   provenance, puis démontrer que les expériences tardives modifient réellement
   l'état utilisé en évaluation.
2. Contrôler la couverture des définitions indépendamment du score de confiance
   du modèle. Une primitive absente exige une collecte de preuve ou une abstention.
3. Relier les prévisions gelées aux issues vérifiées pour adapter la confiance et
   la décision, au lieu de réutiliser la même probabilité comme incertitude inversée.
4. Séparer induction, composition et calcul ; prévoir un outil de calcul si le
   contrat de la tâche l'autorise et mesurer son coût dans tous les bras concernés.
5. Geler un nouveau protocole et un corpus réservé inédit. Conserver la campagne
   négative comme baseline ; ces diagnostics ne la remplacent pas.

## Validation de cette analyse

Les dix tests du banc et les quatre tests de diagnostic passent. Le vérificateur
Python est maintenant versionné, avec les mêmes calculs que le script initial
conservé sur `D:` ; son rejeu des 580 observations passe également.

Le contrôle qualité du périmètre du commit est exécuté séparément. Le passage
global constate trois violations concurrentes hors de ce banc :
`nervous/regulationPolicy.js`, `tests/helpers/omegaProcessClient.cjs` et
`tests/helpers/omegaProcessRuntime.cjs`. Le précontrôle de `npm test` refuse le
checkout sur `C:` faute des 512 Mio libres requis (482 Mio observés), même avec
les temporaires sur `D:`. Les résultats et bases de cette étude restent sur `D:`.
