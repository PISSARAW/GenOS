# ADR 0792 — Expérience de compétence à cinq variantes

- **Date** : 2026-11-04.
- **Statut** : accepté pour un banc expérimental isolé.
- **Portée** : protocole et adaptateurs de benchmark ; services de production inchangés.
- **Domaine** : expérimentation, mémoire et métacognition.

## Contexte

La campagne hybride du 2 novembre réussissait 120 tâches réservées mais les
premières procédures provenaient d'une synthèse affine. Le rejeu rétrospectif
sans propositions du modèle retrouvait le même score après seize observations.
Ce résultat ne permettait d'attribuer le gain ni au LLM ni au seul mécanisme
de mémoire GenOS. La reconnaissance des lacunes ne portait que sur des noms
d'opérateurs absents.

## Décision

Le [nouveau banc](../../benchmarks/competence-five-arms/README.md) conserve cinq
variantes : LLM sans mémoire, historique brut, rappel épisodique GenOS, synthèse
seule et hybride. Toutes reçoivent les mêmes observations et questions. Les
quatre variantes LLM partagent une instruction et des plafonds de ressources,
mais l'information fournie dépend explicitement de la variante.

L'ingestion utilise les services GenOS de production sans modifier leurs
interfaces. La synthèse réutilise l'admission affine, la consolidation et
l'interpréteur existants. L'hybride exécute ce même outil lorsqu'il répond,
sinon consulte la réponse du LLM. Les appels effectivement exécutés restent
distincts de l'origine de la réponse finale.

Six mondes suivent chacun cent observations supervisées. Les contrôles ont lieu
à cinq étapes. Les tâches sont disjointes entre contrôles et partagent une plage
d'entrées mélangée avant observation. Un changement d'époque public et des
exemples non identifiants évaluent aussi le rappel pertinent et l'ambiguïté.

L'oracle est exécuté dans un autre processus. La classe de fonctions est publique,
les coefficients et les étiquettes d'identifiabilité ne sont pas fournis aux
méthodes. Les prévisions sont journalisées avant la notation. Les contextes sont
figés par copie, et l'archive permet de rechercher une fuite d'observations futures.
Un processus séparé restaure la mémoire à chaque contrôle. Les bases, sources
scellées et journaux restent sur `D:`, sans secret ni artefact généré ajouté à Git.

Les contrastes primaires sont prévus dans le [protocole](../../benchmarks/competence-five-arms/protocol.json).
Le monde constitue l'unité de répétition pour le test exact des signes appariés.
Les plafonds, l'arrêt, les erreurs et les hypothèses rejetées restent visibles.
Les échecs de transport ne sont pas assimilés à une abstention réussie.

## Alternatives

- Réutiliser le score affine final : rejeté, car il masque la saturation précoce.
- Attribuer toutes les réponses hybrides au LLM : rejeté, car certaines sont exécutées par l'outil.
- Comparer les variantes sur des mondes différents : rejeté, car cela confond méthode et difficulté.
- Compter les questions d'un monde comme des apprentissages indépendants : rejeté pour les contrastes primaires.
- Qualifier tout GenOS à partir de ce banc : rejeté ; seul le rappel épisodique et l'outil nommé sont évalués.

## Conséquences

Le banc peut produire un résultat négatif malgré une archive correctement
rejouée. Une supériorité éventuelle reste conditionnelle au modèle, à la classe
publique et à ces mondes générés. L'expérience n'isole pas séparément rappel et
LLM dans le contraste hybride-synthèse ; elle ne couvre pas l'exploration active,
les poids du modèle ou une classe de problèmes inconnue. Aucun endpoint REST/MCP,
bail, contrôle de promotion ou contrat de production n'est modifié.

Le [rapport](../06-qualite-preuves/competence-cinq-variantes-2026-11-04.md) conserve
les empreintes, résultats et limites de la campagne effectivement exécutée.
