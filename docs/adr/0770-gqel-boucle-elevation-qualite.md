# ADR 0770 — GQEL : Boucle d'Élévation de Qualité des LLM

- **Statut** : Accepté
- **Date** : 2026-11-02
- **Domaine** : Runtime, Amplification de qualité LLM, Évaluation sémantique, Réparation causale
- **Lié à** : [Épistémologie et évidence](../01-concepts/epistemologie-et-evidence.md), [Contrat de complétion](../03-reference/contrat-completion-mission.md)

## Portée de la décision et état observé

Cet ADR décrit une cible d'architecture. La revue du 2026-11-02 distingue cette
cible du runtime : [concept GQEL](../01-concepts/gqel.md),
[intégration](../02-orchestration/gqel.md),
[contrats exécutables](../03-reference/gqel-boucle-elevation-qualite.md),
[exploitation](../04-exploitation/gqel.md) et
[état des preuves](../06-qualite-preuves/qualification-gqel-2026-11-02.md).

La boucle actuelle utilise des heuristiques déterministes et des objets mutables
en mémoire. Elle n'exécute ni juges indépendants, ni double aveugle, ni budget
de tokens ; son contrôle d'itérations peut être précédé d'une mutation pour
stagnation. Le contrôleur worker est optionnel et l'obligation A-Team ne lance
pas automatiquement une réparation. Le benchmark utilise des réponses fixes.
L'acceptation de cet ADR ne constitue donc pas une preuve d'amplification réelle,
d'immutabilité, d'absence générale de régression ou de raccord à toutes les topologies.

## Contexte

Dans les architectures d'agents traditionnelles, l'évaluation de la réponse d'un LLM se limite souvent à vérifier la présence d'une réponse ou la validité superficielle d'un format (JSON valide, absence de plantage). Les tentatives d'amélioration reposent sur des invites naïves (« Réexamine et améliore ta réponse »), qui échouent à corriger les défauts structurels ou introduisent des régressions sans contrôle d'invariance.

L'objectif est que GenOS puisse amplifier la qualité produite par un même LLM,
avec une mesure comparative du gain et une porte d'acceptation capable de refuser
un livrable non conforme. Un gain nul ou négatif doit rester observable ; une
supériorité ne peut être garantie à l'avance pour toute mission.

## Décision

Introduire **GQEL (GenOS Quality Elevation Loop)** comme protocole transversal de
qualité des livrables, sans créer une nouvelle topologie. Son utilisation dans
A-Team, Trinity ou une organisation construite par la morphogenèse exige un
raccord explicite ; GVX et AGOW sont des mécanismes complémentaires, pas des
topologies supplémentaires.

La cible GQEL repose sur sept principes directeurs ; leur niveau de réalisation
est précisé dans la référence et l'état des preuves liés ci-dessus :
1. **Contrat de qualité compilé a priori** (`compileQualityContract`) : Traduit le brief de mission en critères vérifiables et seuils de qualité minimaux selon des politiques calibrées (`fast`, `balanced`, `critical`).
2. **Évaluation indépendante et multi-dimensionnelle** (`qualityEvaluatorRegistry`) : Analyse sémantique spécialisée par domaine (`creative_writing`, `software_engineering`, `generic`) distinguant défauts bloquants, majeurs et mineurs.
3. **Registre immuable des versions** (`recordIterationVersion`) : Conserve l'historique exhaustif des itérations (V1, V2, V3...), leurs empreintes de contenu et leurs signatures de défauts.
4. **Diagnostic causal et prompt de réparation ciblé** (`buildRepairPrompt`) : Identifie la cause structurelle de chaque défaut et formule des directives correctives ciblées sans réécriture hasardeuse.
5. **Détection de stagnation et mutation de stratégie** (`qualityStagnationDetector`) : Identifie les signatures de défauts persistantes sur plusieurs itérations consécutives et ordonne une mutation méthodologique ou l'arrêt contrôlé.
6. **Comparaison de versions et préservation des acquis** (`qualityComparisonService`) : Empêche toute régression ; la meilleure version (`bestVersion`) est toujours préservée si une itération ultérieure dégrade le score.
7. **Porte de promotion avec obligation de réparation** (`workerQualityContractEnforcer`, `teamEvidenceService`) : Les critères non vérifiés émettent des obligations formelles de réparation (`createRepairObligation`) et bloquent la promotion en l'absence de preuves directes.

## Conséquences

- **Mesure interne** : Chaque cycle terminé normalement calcule `demonstratedGain = score(best) - score(V1)`. Ce delta heuristique ne prouve pas une amplification LLM réelle.
- **Refus local** : Sans conformité, un arrêt normal produit `rejected`, `partially_improved` ou `stagnated`. Le booléen `promoted` ne remplace jamais la gate de mission.
- **Ressources** : Les politiques configurent deux, trois ou cinq itérations par défaut. Les surcharges et l'ordre de décision en stagnation empêchent de les présenter comme un plafond strict ; les limites de consommation restent à imposer par l'appelant.

## Alternatives

Une génération unique ou une révision libre reste une baseline de comparaison.
Créer une nouvelle topologie pour cette boucle dupliquerait les responsabilités
d'organisation ; le choix retenu est un service de qualité composable, dont les
raccords et bénéfices doivent être qualifiés séparément.
