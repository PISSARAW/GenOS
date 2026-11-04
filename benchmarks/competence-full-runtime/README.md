# Compétence avec exécution native GenOS

Ce protocole succède aux deux campagnes négatives sans modifier leurs sources ni leurs résultats.
Il sépare trois obligations : fonctionnement du runtime, induction de fonctions inconnues,
et comparaison prospective après cent observations publiques. Une obligation ne prouve pas les suivantes.

## Exécution

Depuis le dépôt, créer une copie fraîche sur D: :

```powershell
python benchmarks/competence-full-runtime/freeze.py D:/gv3/runtime-neuf
```

Compiler et sceller les deux binaires natifs contre les sources figées :

```powershell
python benchmarks/competence-full-runtime/seal.py D:/gv3/runtime-neuf D:/genos-competence-runtime/rust-target-five-arms
```

Le scellement lie les sources, les binaires et l'exécutable Node. Il refuse de resceller une copie déjà scellée.
Les données, secrets éphémères, bases et workspaces restent sur D: et ne doivent jamais être commités.

```powershell
node D:/gv3/runtime-neuf/benchmarks/competence-full-runtime/control.mjs D:/gv3/controle-neuf
node D:/gv3/runtime-neuf/benchmarks/competence-full-runtime/run.mjs D:/gv3/controle-neuf EMPREINTE_DU_MANIFESTE
```

Le second programme refuse un contrôle échoué ou associé à un autre modèle/runtime.
Le contrôle crée six fonctions privées, deux par famille, sans communiquer leurs coefficients.
Il réserve dix évaluations numériques et deux cas d'ignorance. Les trois workers doivent être acceptés
par les oracles natifs, la mission doit réussir, le graphe doit être mesuré, les douze résultats doivent
être corrects et les trois modèles doivent distinguer eux-mêmes ambiguïté et absence d'observations.
Le modèle et son empreinte sont fixés dans `protocol.json` après les sondes de développement,
avant la génération des mondes primaires. Les refus des modèles antérieurs sont conservés séparément.

## Conditions

La campagne reprend six mondes, les checkpoints 0/16/40/64/100 et douze requêtes disjointes par checkpoint.
Il s'agit de cent observations, avec induction LLM aux cinq checkpoints, et non de cent appels LLM.

| Variante | Informations et calcul |
| --- | --- |
| `no_memory` | Aucun historique, contexte mémoire optionnel désactivé. |
| `raw_history` | Historique public complet ; contexte mémoire optionnel désactivé. |
| `genos_memory` | Rappel de stockage de production, observations dédupliquées, programmes publics validés persistés. |
| `synthesis_only` | Synthèse affine de production et interprète ; aucun LLM ni mission multiworker. |
| `hybrid` | Même calcul affine, puis propositions du LLM avec mémoire. |

Chaque couple monde/variante LLM possède son runtime et ses stockages privés.
Leurs sources sont liées à la copie figée sur D: ; les dépendances utilisent des jonctions vers ses copies figées.
Les fichiers de code sont immuables pendant les mesures. Aucun pointeur de stockage préexistant n'est recopié.
Les programmes retenus ne reçoivent jamais les réponses réservées.
Le regroupement du prompt conserve tous les couples observés, y compris leurs répétitions.
Les mémoires de régulation du runtime restent distinctes du rappel optionnel des connaissances de tâche ;
ces noms de variantes ne signifient pas que toute fonction biologique liée à la mémoire est supprimée.

Les quatre variantes LLM utilisent la même route locale explicite et la même enveloppe.
Les missions multiworkers utilisent la chaîne commune : planification, contrats, branches,
budgets, protocoles mission, oracles, barrière et graphe de vérité.
La configuration native in-process des workers évite le transport par pipes Windows.
Elle n'active pas les mécanismes spécifiques aux workers supervisés par processus, dont GQWF.
Le rapport doit distinguer mécanismes observés, absents et non applicables.
Le calcul numérique reçoit un prompt compilé depuis le contrat scellé : identité et rôle opérationnels,
observations et programmes publics, exigences d'artefact. Les biographies et exemples génériques de rédaction
ne sont pas transmis à cette primitive. La planification, les génomes et les contrôles natifs restent exécutés.

## Interprétation

Le contrat scellé sélectionne l'oracle natif `bounded_function_induction`.
Deux processus de vérification contrôlent la concordance avec les observations publiques
et l'identifiabilité dans la classe finie déclarée. Le sujet conserve le contrat d'artefact,
sa provenance et les usages réels du fournisseur. Un simple oracle `worker_artifact` ne suffirait pas.
La sortie `functionPrograms` est un objet JSON obligatoire ; les déclarations d'ignorance
utilisent `kind: unknown`, des coefficients sentinelles nuls et une confiance nulle.
Le prompt fournit les familles et les formules de différences finies : l'expérience mesure
l'induction de nouveaux coefficients, pas la découverte de cet algorithme.
Il admet les propositions du LLM et ne les remplace pas par un solveur général.
L'oracle privé séparé ne sert qu'aux mesures réservées.

Les déclarations brutes d'ignorance sont conservées séparément des abstentions imposées par les gardes.
Elles sont conservées aussi lorsqu'un oracle refuse le programme. Un refus natif est un résultat de mesure ;
il ne devient pas une prédiction valide. Une erreur fatale de transport ou d'intégrité marque la campagne incomplète.
Les deux contrastes principaux à 100 observations utilisent les mondes comme unités indépendantes,
un test des signes apparié unilatéral, un seuil 0,025 et un gain minimal de dix points.
Le changement de modèle et de protocole interdit d'attribuer un écart historique avec v2 aux seules corrections.
Même une campagne favorable ne démontre pas une compétence générale ni une modification des poids du modèle.
