# ADR 0292 — Exécution et gates des douze variants Trinity

- **Statut** : Accepté
- **Date** : 2026-10-03
- **Amendé** : 2026-10-04
- **Domaine** : Trinity, orchestration, diversité, preuves et promotion
- **Lié à** : ADR 0162, ADR 0279, ADR 0281, ADR 0282, ADR 0283, ADR 0284, ADR 0286
- **Références** : [`topologies/trinity.md`](../02-orchestration/topologies/trinity.md), campagne [`round3`](../../artifacts/trinity-missions/round3/README.md)

## Contexte

La campagne réelle R3, exécutée avant les corrections décidées ici, a lancé douze missions
avec 36 agents, du 2026-10-03 à 18:36 à 19:39. Les douze résultats étaient `ESCALATE` et
aucun merge n'a eu lieu. Les rapports
ont montré que plusieurs missions décrivaient le variant attendu sans produire son artefact
discriminant : les sorties factorielles n'avaient pas de cellules, l'oracle pas de distribution
exploitable, la récursion pas de mission enfant vérifiable et le jury pas de délibération.
La mission hétérogène a aussi révélé que les familles assignées ne prouvaient pas les modèles
effectivement exécutés.

Les exécuteurs existaient pour plusieurs politiques, mais ils n'étaient pas tous appelés par
le chemin `dispatch_trinity` ou le superviseur. La description « implémenté » du catalogue
confondait ainsi disponibilité d'un module, déclenchement d'un runner et réussite d'une mission.

## Décision

1. Relier chacun des douze variants au dispatch ou au superviseur Trinity. Les appels de
   runners doivent produire des reçus structurés que le gate de mission peut inspecter.
   Conserver le preset choisi automatiquement par les signaux de mission jusqu'au dispatch ;
   si ses préconditions échouent, revenir à `controlled` en gardant le variant recommandé
   comme suggestion.
2. Garder la baseline à trois mondes. Le factoriel lance huit cellules (`approach`, `modelTier`,
   `validation`) répétées deux fois, soit seize workers. Les réplicas QD et les missions enfants
   récursives consomment des ressources additionnelles et sont soumis à leurs propres limites.
3. Propager l'assignation `localModel` jusqu'au worker, mais vérifier la provenance du modèle
   effectif avant de conclure à une diversité fournisseur.
4. Exiger des éléments observables propres à chaque variant : interventions et vecteurs
   vérifiés pour le contrefactuel ; identifiants et facteurs pour les cellules ; délibération
   et calibration pour le jury ; exécution enfant et lignage pour la récursion ; incertitude
   sourcée pour l'adaptation ; effets sourcés pour le temporel ; distribution pour l'oracle ;
   vecteurs et niches vérifiés pour l'exploration.
5. Faire échouer fermé toute composition incomplète. Un runner appelé ou une réponse de modèle
   bien formée ne suffit pas à établir la vérité, un effet causal ou une promotion sûre.
6. Conserver le statut produit Trinity `partiel` après R3. La campagne établit que les voies
   pré-correctifs échouaient ; elle ne vérifie pas les runners ajoutés ensuite. Aucune mission
   post-correctifs n'a encore satisfait son gate de sortie.

## Conséquences

- Les composants concernés sont `topologyTrinityHandler.cjs`, `trinity-supervisor.cjs`,
  `trinityVariantRuntime.js`, `trinityTemporalHorizons.js`,
  `trinityNestedMissionRunner.js` et `trinityAdaptiveContinuationRunner.js`.
- Les préconditions de capacité et de budget sont documentées dans la fiche Trinity. Les
  parcours adaptatif et QD nécessitent des configurations structurées ; le factoriel requiert
  seize places au dispatch ; le jury requiert au moins deux URI de modèles distinctes.
- Une campagne post-correctifs devra démontrer une exécution nominale par variant et conserver
  rapports, provenances, reçus et refus. Aucun résultat R3 n'est requalifié en succès.
- L'affirmation antérieure d'ADR 0162 selon laquelle trois variants étaient refusés reste un
  constat historique, amendé par cette décision.

## Alternatives

- **Déclarer les variants opérationnels sur la seule présence des modules** : rejetée, car
  R3 a montré l'écart entre le nom de politique et son artefact d'exécution.
- **Transformer les sorties manquantes en résultats synthétiques** : rejetée, car cela
  fabriquerait les preuves et permettrait une promotion sans mesure indépendante.
- **Garder le refus des variants incomplets au dispatch** : rejetée pour les runners désormais
  branchés ; leurs préconditions et gates bloquent à présent l'expérience ou sa fusion avec
  un motif explicite.
