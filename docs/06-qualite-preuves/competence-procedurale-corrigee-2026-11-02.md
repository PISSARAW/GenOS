# Compétence procédurale corrigée : validation bornée de l'agent hybride

- **Date** : 2026-11-02.
- **Dernière revue** : 2026-11-02.
- **Statut** : correction implémentée, campagnes réelles conservées et rejouées.
- **Verdict v3** : `bounded_support`, tous les critères prévus passent.
- **Portée** : agent hybride dans un monde affine généré, pas compétence générale.
- **Promotion runtime** : aucune.

## Résultat principal

Après cent expériences avec Qwen 2.5 Coder 7B réel, l'agent hybride réussit les
120 tâches réservées résolubles et reconnaît les 40 définitions manquantes.
L'état initial et l'état réinitialisé réussissent zéro tâche résoluble : ils
s'abstiennent faute de procédures apprises. La comparaison appariée concerne
ces trois états du même agent v3, avec les mêmes outils et le même modèle.

| Mesure | Initial | Après 100 expériences | Réinitialisé |
| --- | ---: | ---: | ---: |
| Nouvelles entrées exactes | 0/60 | 60/60 | 0/60 |
| Compositions nouvelles exactes | 0/60 | 60/60 | 0/60 |
| Total résoluble | 0/120 | 120/120 | 0/120 |
| Couverture des tâches résolubles | 0 % | 100 % | 0 % |
| Lacunes correctement reconnues | 40/40 | 40/40 | 40/40 |
| Erreurs à haute confiance sur les lacunes | 0/40 | 0/40 | 0/40 |
| Brier réservé sur les tâches résolubles | 0 | 0,002812 | 0 |

Le zéro du Brier initial résulte de l'abstention totale avec confiance nulle ;
il ne constitue pas une compétence. Le Brier final satisfait les seuils absolus
et de dégradation fixés. Les quatre bornes inférieures de gain valent 60,05
points, au-dessus des 10 points requis. La borne inférieure de reconnaissance
des lacunes est 88,72 % ; la borne supérieure d'erreur confiante est 11,28 %.
Les six bornes utilisent la correction de Bonferroni et un risque familial de 5 %.

## Corrections effectives

L'[ADR 0768](../adr/0768-competence-procedurale-verifiee-et-couverture.md)
définit le module interne borné. Les sources sont
`backend/src/services/experienceCompetence/`,
`hybridProceduralLearningService.js` et `proceduralInductionPromptService.js`.

1. **Apprentissage utile** : chaque épisode ajoute une observation signée. Les
   propositions du modèle et celles d'une synthèse affine bornée doivent
   satisfaire toutes les observations sur au moins trois entrées distinctes.
   La consolidation GenOS conserve une procédure exécutable et ses preuves.
2. **Connaissances manquantes** : la couverture de chaque opérateur est vérifiée
   indépendamment de la confiance verbale. Une primitive absente impose une
   abstention, même dans un contexte partiellement familier.
3. **Calcul** : un interpréteur entier borné exécute les procédures admises ;
   aucune chaîne de code du modèle n'est exécutée. Une observation contradictoire
   retire la procédure au lieu de la conserver avec une confiance arbitraire.
4. **Calibration** : une prévision fondée sur le support observé est figée avant
   exécution par `metacognitiveForecastService`, puis résolue avec une issue
   d'oracle séparé et un reçu signé. Le banc métacognitif de production ajuste
   le plancher d'abstention si une surconfiance est mesurée.

La recherche algébrique n'accède qu'aux observations d'entraînement signées,
jamais aux coefficients privés du monde ni aux solutions réservées. Les
consolidations représentent des replays vérifiés du candidat sur ces observations,
pas une réécriture des échecs des essais originaux en succès.

## Rôle réel du LLM et de l'outil

La v3 effectue **100 appels LLM d'apprentissage** puis **480 évaluations de
procédures figées** dans les trois états. Le journal distingue ces événements.
Le test n'annonce donc pas 580 réponses du modèle. Les poids restent fixes.

Les quatre premières admissions viennent de la synthèse bornée. Au cours des
cent épisodes, 28 propositions du modèle passent ensuite toutes les vérifications ;
les quatre procédures finales portent une source de modèle et 25 preuves chacune.
Le journal conserve toutes les sources antérieures. La synthèse seule pourrait
apprendre cette famille : ce résultat ne prouve pas un bénéfice causal du LLM
seul. Le gain appartient à l'agent hybride avec apprentissage externe et outil.

L'état est restauré dans un autre processus avant les tests, puis reste figé.
Les cent observations sont appliquées ; le prior de la première procédure passe
encore de 0,958333 à l'épisode 88 à 0,962963 à l'épisode 100. Le test ne prouve pas
que cent épisodes sont nécessaires : c'est le point d'évaluation choisi.

## Campagnes conservées, sans remplacement des échecs

La [v1 négative](competence-cent-experiences-2026-11-02.md) reste inchangée.
Le prototype v2, limité aux seules propositions du LLM, a aussi été exécuté
jusqu'au terme : 580 réponses valides, deux procédures admises, 55/120 tâches
résolubles réussies et 40/40 lacunes reconnues. Il échoue aux critères de
couverture, de transfert composé et d'évolution tardive de la première procédure.

Le recours à la synthèse bornée et le retour de contre-exemples répondent aux
échecs d'induction observés dans les données d'entraînement. La v3 utilise ensuite
un autre corpus réservé, scellé avant observation, avec les mêmes seuils de
succès. Les scores historiques v1/v2/v3 ne sont pas une comparaison causale
appariée : plusieurs composants et les mondes ont changé.

### Diagnostic et réponse apportée

| Échec observé | Cause étayée par les traces | Correction et portée de sa vérification |
| --- | --- | --- |
| V1 : 13/120 réussites, aucune composition réussie | Le rappel plafonne à douze exemples ; le contexte fourni n'évolue plus après l'épisode 12 | Cent observations persistées, procédures consolidées et contrôle de leur restauration dans un autre processus |
| V1 : 24 réponses confiantes sur des définitions absentes | La confiance déclarée ne garantit pas la couverture des primitives | Contrôle de couverture avant calcul ; 40/40 lacunes reconnues en v2 et v3 |
| V1 : erreurs de calcul malgré des exemples disponibles | Le modèle doit inférer puis calculer dans sa réponse textuelle | Interpréteur entier borné ; calcul réservé vérifié par un oracle séparé |
| V2 : seulement deux procédures admises, 55/120 réussites | Les propositions du modèle ne permettent pas d'admettre les quatre règles | Contre-exemples publics et synthèse affine bornée ; premières admissions v3 issues de la synthèse |
| V2 : absence d'évolution tardive pour la première procédure | Sans règle admise pour cet opérateur, son support procédural ne progresse pas | Mise à jour du support et de la prévision à chaque observation ; changement mesuré entre les épisodes 88 et 100 en v3 |

Ces corrections expliquent le choix des composants ; elles ne constituent pas
une ablation mesurant l'effet causal individuel de chaque composant. Le succès
v3 doit être attribué à l'ensemble hybride évalué. L'abstention initiale reconnaît
déjà toutes les lacunes : le progrès mesuré porte sur la résolution des tâches
résolubles, tout en conservant cette reconnaissance de l'ignorance.

## Révisions et procédure d'audit

- `2c44429a61652104547c701bec6052c8da71df9b` : banc initial, campagne négative et diagnostic.
- `01ef2cb4ac6558de2f987bd11a8b4bf6f1fc004d` : modules corrigés, bancs v2/v3, ADR et résultats réels.
- [Protocole scellé v3](../../benchmarks/competence-100-v3/protocol.json).
- [Vérificateur v3](../../benchmarks/competence-100-v3/verify.cjs) et
  [contre-vérification Python](../../benchmarks/competence-100/diagnostics/python_crosscheck.py).

Les commandes de rejeu ci-dessous ne lancent aucune nouvelle inférence. Elles
nécessitent les artefacts locaux conservés sur `D:` ; un clone du dépôt seul
ne contient ni ces données ni les bases SQLite. Pour auditer la campagne
historique, utiliser la révision corrigée ci-dessus : le vérificateur compare
les sources courantes aux empreintes scellées. Une évolution ultérieure du code
peut donc provoquer un refus de vérification sans modifier les anciennes données.

Un code de sortie nul du vérificateur signifie que le rejeu est cohérent avec
l'archive. Il ne signifie pas que l'hypothèse expérimentale est confirmée :
le rejeu v2 réussit tout en conservant `not_demonstrated`. Lire séparément
`conclusion.status`, chaque élément de `conclusion.gates` et les contrôles
`integrity` dans `report.json`. La v3 observée vaut `bounded_support` et garde
`generalCompetenceDemonstrated: false` et `authorizesPromotion: false`.

## Artefacts réels sur D

- V2 : `D:\genos-competence-results\v2\d32fa6db-4fc9-481c-8a9f-4709dacef815`.
- Manifeste v2 : `652f67d9f7ab9c3fe6810025d67c1d8273361e96632e4ef32fe2df65ec0216be`.
- V3 : `D:\genos-competence-results\v3\c5928c78-3821-4601-bd71-8e1b634ccf35`.
- Manifeste v3 : `caeed898b2a5eabec5a535f63be593076270c8a4f0aba7cb201035137a298f3b`.
- Logs et validations : `D:\genos-competence-results\v2-validation` et `v3-validation`.

Chaque dossier contient manifeste, sources scellées, journal chaîné, observations,
états d'apprentissage, reçus, base isolée, mesures et rapport. Les secrets HMAC
ne sont pas exportés. Le vérificateur hors ligne rejoue mathématiquement
l'admission, les prompts, les procédures, les calculs, les prévisions et les scores ;
il ne prétend pas revalider un HMAC avec une clé publiée.

```powershell
node benchmarks/competence-100-v3/verify.cjs D:\genos-competence-results\v3\c5928c78-3821-4601-bd71-8e1b634ccf35 caeed898b2a5eabec5a535f63be593076270c8a4f0aba7cb201035137a298f3b
python benchmarks/competence-100/diagnostics/python_crosscheck.py D:\genos-competence-results\v3\c5928c78-3821-4601-bd71-8e1b634ccf35
```

Les deux implémentations concordent sur les 580 issues et les bornes. Le banc
métacognitif de production contient 260 prévisions résolues pour l'agent appris,
zéro issue invalide ou non résolue ; Brier global 0,004, ECE 0,05. Le modèle est
`qwen2.5-coder:7b`, digest de catalogue
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
La campagne v3 dure 199,820 secondes et observe 17 997 tokens d'entrée et 1 272
de sortie pour l'apprentissage. Coût monétaire : `null`.

## Validation et limites

Les sept tests du prototype et les huit tests hybrides passent : refus de preuves
altérées, contradictions, admission, couverture, calcul borné, persistance,
calibration et évolution tardive. Les tests Rust passent et le contrôle qualité
global avant la campagne finale ne signale aucune nouvelle violation. La suite
Node globale est refusée par le précontrôle d'espace du checkout sur `C:` ; les
artefacts de l'étude restent sur `D:`.

Pour répéter les vérifications ciblées depuis la racine du dépôt :

```powershell
node benchmarks/competence-100-v2/test.cjs
node benchmarks/competence-100-v3/test.cjs
python scripts/ci/check_code_quality.py
python scripts/ci/commit_receipt.py --sha 01ef2cb4ac6558de2f987bd11a8b4bf6f1fc004d --require-receipt
```

Les journaux historiques sont `v2-validation/tests-before-run.log`,
`v3-validation/tests.log`, `v2-validation/cargo-test.log`,
`v2-validation/quality-hybrid.log` et `v3-validation/quality-staged.log`, sous
la racine locale `D:\genos-competence-results`. Le précontrôle Node consigné
dans `v2-validation/npm-test.log` mesurait 146 Mio libres sur `C:`, contre
512 Mio requis : cette suite globale n'est pas comptée comme réussie.

Le module est interne, sans nouvel endpoint REST/MCP et sans changement des baux
ou des portes de promotion. Le domaine affine est connu à l'avance ; les tâches
et compositions sont inédites, mais la classe de modèles n'est pas inconnue.
Une seule lignée et un seul monde par version sont testés. Les signatures et
oracles appartiennent à la frontière locale de l'expérimentateur, pas à un
laboratoire tiers. Le résultat ne qualifie ni l'orchestrateur autonome complet,
ni une compétence générale, ni une modification des poids du LLM.
