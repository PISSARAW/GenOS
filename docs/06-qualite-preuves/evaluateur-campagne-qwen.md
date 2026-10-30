# Évaluateur externe de la campagne Qwen

`benchmarks/qwen-worker-missions/assess.cjs` évalue la sortie JSON de `inspect.cjs` pour les missions 01, 02, 04, 06, 08 et 09. Exemple : `node benchmarks/qwen-worker-missions/assess.cjs 02 evidence.json`.

Le résultat contient `passed`, `failed` ou `unmeasured`, les contrôles appliqués et le run concerné. Le dernier événement terminal est utilisé : un refus ou une sortie non exploitable reste non mesuré. Les sommes, affectations et offsets sont recalculés à partir des fixtures du protocole, sans appel au modèle. Un résultat formel valide ne prouve pas la validité sémantique globale de la mission.

L'option `--negative` (ou troisième argument `{ negative: true }` de `assess`) contrôle la structure d'un refus : `unresolved`, raisons explicites, aucun claim ni achèvement revendiqué. Un rapport de vérification avec verdict `unresolved` est aussi accepté. Une erreur de schéma sans rapport exploitable est non mesurée. Ce contrôle ne détermine pas automatiquement si la raison donnée est sémantiquement correcte.

Pour le poème, seuls le nombre de lignes, les strophes et le mot interdit sont contrôlés. Pour ABC, l'évaluateur accepte un sous-ensemble monophonique explicite avec notes, silences et durées simples ; les constructions non prises en charge restent non mesurées. Il vérifie les en-têtes, huit mesures complètes en 4/4 et le retour des deux premières mesures à la fin. L'interprétation de A-prime et B, l'écoute et l'esthétique ne sont pas automatisées. La causalité scientifique n'est pas évaluée par le contrôle numérique des latences.

Cet évaluateur est indépendant du worker et ne crée aucun oracle ni receipt sémantique GenOS. Son champ `genosSemanticOracle` vaut toujours `false`. Les métadonnées du run et la preuve d'appel Qwen doivent être examinées séparément dans la campagne.
# Entrées numériques non ambiguës

Un cas négatif ne peut passer qu'avec un refus sans claim ni trace d'accomplissement.
Un verdict `unresolved` accompagné de claims reste non mesuré, car un contrôleur
structurel ne sait pas distinguer un claim explicatif d'une action prétendument faite.

L'inspection relit l'identité du worker dans le reçu final CLI, la confirme dans
les agents, les membres de mission et le binding biologique du run. L'évaluation
porte uniquement sur le dernier run de ce worker et son propre événement terminal.
Un succès ou une consommation d'un sibling de reprise ne qualifie pas ce résultat.
Le modèle Ollama mesuré doit être celui demandé dans le payload, avec une
consommation terminale non nulle identique aux métriques de ce même run. Sans ces
liaisons, le résultat est `unmeasured`.


Les cartes 01, 02, 04 et 06 exigent désormais un seul claim dont le champ
`statement` contient un objet JSON non ambigu. Les nombres décimaux et scientifiques
équivalents sont acceptés : `115`, `115.0` et `1.15e2` représentent la même valeur.
Une prose, des claims supplémentaires, des clés dupliquées à toute profondeur
(y compris via des échappements) ou des nombres encodés comme chaînes restent `unmeasured`.
L'évaluateur n'extrait plus le premier nombre d'une phrase : une négation ou une
correction contradictoire ne peut ainsi valoir une preuve positive.

Les objets portent respectivement `machines/total/makespan` (et `optimal`
facultatif), `count/sum/mean/median/maximum`, `matches`, et
`mean_before/mean_after/difference/causal`. Les calculs sont refaits à partir des
fixtures ; la carte 06 contrôle aussi les mesures structurées présentes dans
l'artefact, leurs unités et l'absence de causalité déclarée.

Le parseur contrôle les lexèmes avant `JSON.parse`. Il normalise les décimales
par chiffres et exposant entier, sans calcul de puissance ni arrondi numérique,
puis compare à la représentation décimale de la valeur décodée. Ainsi,
`210.00000000000001` n'est pas accepté comme `210` après l'arrondi de JavaScript.
Les valeurs non finies, l'underflow vers zéro et les entiers hors de la plage sûre
sont refusés. Le parseur est borné à 65 536 caractères et 64 niveaux ; dépasser
ces bornes reste non mesuré. Ce contrôle ne prétend pas fournir un calcul décimal
arbitraire : les comparaisons de valeurs des missions conservent leurs critères
numériques explicites. `test_qwen_json_numeric_forms.cjs` couvre les formes
équivalentes, les doublons échappés/profonds et les pertes de précision.

