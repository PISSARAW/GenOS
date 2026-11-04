# Cinq variantes avec plans typés et contrôle positif

Cette version conserve la [première comparaison](../competence-five-arms/README.md)
et corrige l'application des règles : le LLM propose des programmes typés,
un validateur les confronte aux observations et un interpréteur borné commun
calcule l'expression. Les coefficients ne sont pas déduits par cet interpréteur.
Les sorties ne sont pas présentées comme des calculs numériques natifs du modèle.

L'[ADR 0794](../../docs/adr/0794-application-regles-typees-et-controle-positif.md)
décrit le choix. Le [protocole](protocol.json) fixe les seuils, budgets et limites,
et le [rapport](../../docs/06-qualite-preuves/competence-cinq-variantes-controle-positif-2026-11-04.md)
consigne les résultats et leurs empreintes.

## Condition de lancement

Un contrôle positif indépendant de seize cas doit produire seize réponses
exactes et valides avec la même version du modèle et du pipeline. Il fournit
des règles explicites et teste leur liaison aux opérateurs, au contexte et
aux compositions, avec l'interpréteur commun. Il ne teste pas leur induction.
Les essais de développement restent séparés et leurs échecs sont conservés.

Le contrôle du 4 novembre passe **16/16 en seize appels réels**, sans correction
additionnelle. Son empreinte est
`3a89277a565b89158ffed52eb6039321d343bdae2e5cb32dfd657798481e0fe5`.
`run.cjs` rejoue ce contrôle et vérifie ses sources avant de tirer les seeds
des mondes. Sans ces preuves, il refuse de démarrer avant tout appel expérimental.

## Cinq variantes comparables

| Variante | Information et exécution |
| --- | --- |
| `no_memory` | Question sans exemples ; programmes LLM soumis au même validateur et interpréteur |
| `raw_history` | Historique chronologique complet, anciennes époques étiquetées ; même pipeline |
| `genos_memory` | Rappel épisodique GenOS des opérateurs et de l'époque pertinents ; même pipeline |
| `synthesis_only` | Synthèse affine de production et interpréteur existants ; aucun LLM |
| `hybrid` | Même rappel GenOS et proposition affine ; réponse d'outil explicite si elle existe, sinon programme LLM validé |

Six mondes suivent cent observations supervisées chacun. Les étapes sont 0,
16, 40, 64 et 100, avec douze questions nouvelles par étape. Le générateur est
celui du banc précédent, sur des seeds nouvelles. Les observations répétées
ne constituent pas cent acquisitions de compétences distinctes.

Les quatre variantes LLM partagent instruction, schéma, interpréteur et plafond
de deux propositions par question : 1 440 questions, au plus 2 880 appels réels.
La seule correction autorisée utilise un témoin d'entraînement public, jamais
la réponse réservée. Il n'y a ni réparation silencieuse du JSON ni essai choisi
après observation du score. Les compteurs de tokens sont natifs et les coûts
réels des deux propositions éventuelles sont additionnés.

`providedRules` est toujours vide dans la campagne. Les coefficients et les
classes des règles privées ne sont jamais fournis au modèle. La synthèse de
contrôle ne cherche que les règles affines ; les programmes quadratiques ou
à charnière des variantes LLM doivent être proposés par le modèle.

Les refus d'absence d'observation et d'insuffisance d'entrées distinctes sont
structurels et leur source est publiée. Un programme cohérent avec les exemples
peut encore être trop confiant si plusieurs classes s'accordent sur ces exemples.
L'oracle séparé continue de mesurer cette ambiguïté. Aucun score ne qualifie
une introspection générale, une modification des poids ou tout l'orchestrateur.

## Exécution sur D

Le modèle local installé est `qwen2.5-coder:7b`, avec le même digest que la
première campagne. Les [sorties structurées Ollama](https://docs.ollama.com/capabilities/structured-outputs)
contraignent le schéma ; le validateur local vérifie séparément ses propriétés.

```powershell
$env:TEMP = 'D:\genos-competence-runtime\five-arm-tmp'
$env:TMP = $env:TEMP
node benchmarks/competence-five-arms-v2/test.cjs
node benchmarks/competence-five-arms-v2/control.cjs development
node benchmarks/competence-five-arms-v2/control.cjs validation
node benchmarks/competence-five-arms-v2/run.cjs <controle-valide> <empreinte-controle>
node benchmarks/competence-five-arms-v2/verify.cjs <campagne> <empreinte-campagne>
python scripts/experiments/crosscheck_typed_competence.py <campagne>
```

L'archive conserve chaque proposition native, le témoin éventuel, le programme
retenu, la réponse finale, la mémoire isolée et les sources normalisées. Les
rejeux ne relancent pas le modèle et ne changent pas le verdict expérimental.
Le vérificateur Python réimplémente l'oracle et contrôle les exécutions typées ;
il distingue nombre de questions et nombre d'appels natifs. Les deux implémentations
de vérification viennent du même expérimentateur, sans laboratoire tiers attesté.

## Résultat du 4 novembre

La campagne complète compte 1 800 prédictions et 1 814 appels Qwen réels en
54,75 minutes. Les deux audits passent. Après cent observations, les scores
utiles sont 0/48 sans mémoire, 0/48 avec historique, 1/48 avec rappel GenOS,
18/48 pour la synthèse et 18/48 pour l'hybride. GenOS contre historique donne
`p=0,5` et +2,08 points ; hybride contre synthèse donne `p=1` et zéro gain.
Les deux contrastes échouent aux critères préenregistrés.

L'application avec règles fournies est validée pour ce pipeline outillé.
Le gain de compétence recherché reste non démontré. L'induction reste faible
et des programmes cohérents mais non identifiables sont encore acceptés à
l'étape 16. Les abstentions finales sur les lacunes proviennent des gardes
structurelles ; elles ne prouvent pas une introspection apprise du modèle.
Le rapport conserve les courbes, coûts, corrections infructueuses et traces.
