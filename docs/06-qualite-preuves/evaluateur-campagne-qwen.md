# Évaluateur externe de la campagne Qwen

`benchmarks/qwen-worker-missions/assess.cjs` évalue la sortie JSON de `inspect.cjs` pour les missions 01, 02, 04, 06, 08 et 09. Exemple : `node benchmarks/qwen-worker-missions/assess.cjs 02 evidence.json`.

Le résultat contient `passed`, `failed` ou `unmeasured`, les contrôles appliqués et le run concerné. Le dernier événement terminal est utilisé : un refus ou une sortie non exploitable reste non mesuré. Les sommes, affectations et offsets sont recalculés à partir des fixtures du protocole, sans appel au modèle. Un résultat formel valide ne prouve pas la validité sémantique globale de la mission.

L'option `--negative` (ou troisième argument `{ negative: true }` de `assess`) contrôle la structure d'un refus : `unresolved`, raisons explicites, aucun claim ni achèvement revendiqué. Un rapport de vérification avec verdict `unresolved` est aussi accepté. Une erreur de schéma sans rapport exploitable est non mesurée. Ce contrôle ne détermine pas automatiquement si la raison donnée est sémantiquement correcte.

Pour le poème, seuls le nombre de lignes, les strophes et le mot interdit sont contrôlés. Pour ABC, l'évaluateur accepte un sous-ensemble monophonique explicite avec notes, silences et durées simples ; les constructions non prises en charge restent non mesurées. Il vérifie les en-têtes, huit mesures complètes en 4/4 et le retour des deux premières mesures à la fin. L'interprétation de A-prime et B, l'écoute et l'esthétique ne sont pas automatisées. La causalité scientifique n'est pas évaluée par le contrôle numérique des latences.

Cet évaluateur est indépendant du worker et ne crée aucun oracle ni receipt sémantique GenOS. Son champ `genosSemanticOracle` vaut toujours `false`. Les métadonnées du run et la preuve d'appel Qwen doivent être examinées séparément dans la campagne.
