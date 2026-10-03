# Trinity RÉEL (agents GenOS + ollama) vs SIMULÉ — comparatif honnête

Campagne réelle : 03/10/2026 15:30–15:56, modèle `ollama://qwen2.5-coder:7b`, 6 missions × 3 workers = 18 agents réels, ~1–2 min/mission. Dossiers bruts : `real-ALL-evidence.json`. Simulations conservées : `N1-report.md`…`N6-report.md` (dossiers rédigés par moi, composition Trinity réelle).

## Verdicts de la barrière comparative (tous réels, tous identiques)

Les 6 comparaisons supervisées ont rendu **ESCALATE_EXPERIMENT (`required_evidence_vector_or_provenance_missing`), `canMerge=false`, frontier vide, scores 0.15**. Aucune fusion. C'est le comportement correct du gate : un transport réussi n'est pas une décision valide.

## Par mission : réel vs simulé

| Mission | Réel (3 mondes qwen2.5-coder:7b) | Simulé (moi) | Gagnant |
|---|---|---|---|
| N1 cold-start | W1 évasion (fichiers manquants) ; W2 truisme ; W3 **répond à N3** (contamination mémoire) → ÉCHEC | cold-start/pool + 6 concurrentes réfutables | simulé |
| N2 corbeaux | 3/3 détectent la fallace (FR), mais superficiel : SEP au hasard, DOI confabulés, W3 cite **ad hominem (faux)** et Quora → PARTIEL-FAIBLE | 6 fautes nommées + conclusion reconstruite | simulé |
| N3 lenteurs | W1 évasion ; W2/W3 verrou, preuves inventées (`evidence1/2/3`, `<source-ref>`, `README`) → PARTIEL-FAIBLE | H3≥H1, H2 réfutée, expériences discriminantes | simulé |
| N4 finance | W1 compare vraiment (penchant ES+CQRS, preuves `example.com` inventées) ; W2 platitudes sécu ; W3 `reject` de la mission → PARTIEL-FAIBLE | front de Pareto {(1),(3)}, (2) dominé | simulé |
| N5 12 pièces | W1 évasion ; W2 **revendique sans stratégie** ; W3 déclare le problème **insoluble (faux)** → ÉCHEC (la falsification tue le vrai) | arbre correct + preuve 24 cas | simulé, largement |
| N6 trajet | W1 revendique sans algorithme ; W2 **contaminé N5** ; W3 vide → ÉCHEC | hybridation A/B/C + KEEP_PARETO | simulé, largement |

Aucun monde réel n'a produit : un front de Pareto, une réfutation ciblée correcte, un arbre de pesées, ou une preuve de couverture.

## Faits systémiques (plus importants que le score)

1. **Fail-closed adapters** : `dispatch_trinity` passe `availableAdapters:[]`, donc `heterogeneous` (diversity_planner), `adversarial` (adversarial_cross_examiner) et `pareto` (pareto_objective_assigner) sont **indispatchables**. Seuls `controlled` et designs composés sans adapters passent (ex. `adversarial_review_prep`). Mon N2 `heterogeneous` a échoué avec stack complète (`TRINITY_DESIGN_ADAPTER_MISSING`). Les « bons variants » de la campagne simulée sont donc théoriques via le pont actuel.
2. **Divergence formelle OK, substantielle faible** : 3 mondes scellés, rôles/kinds distincts, ~10–40 s LLM chacun en parallèle — mais qwen2.5-coder:7b (code, 7b) est hors domaine sur ces missions de raisonnement.
3. **Contamination inter-missions par la mémoire** : N1-W3 et N6-W2 citent d'autres missions (`search_memory` ramène les missions précédentes). Les chambres ne sont pas informationnellement scellées côté mémoire.
4. **Preuves inventées en série** : `example.com/ref1-3`, `evidence1/2/3`, `<source-ref>`, DOI et URLs confabulés. L'exigence `evidenceVectorEvidence` est remplie avec du toc — et c'est exactement ce que la barrière a sanctionné (scores 0.15, pas de merge).
5. **Les gates tiennent** : comparative barrier + promotion + supervisor (`TRINITY_MISSION_COMPLETED`, `canMerge:false`) ont fonctionné 6/6. Le système a refusé de transformer du faible en décision.
6. **Antécédent 28/09 cohérent** : 2 dispatches N2 réels déjà tentés (1 bloqué, 1 monde complété sans réponse utile, ImpossibleBench+mémoire puis gate de promotion). Même plafond.

## Télémétrie réelle

- Dispatch→compared : ~75–120 s/mission ; workers parallèles ~10–40 s LLM ; EVIDENCE_REPORT 1–3 Ko/monde.
- Replay : `node artifacts/trinity-missions/launch_real.cjs N<i>` puis `check_mission.cjs "<fragment>"`, `fetch_verdicts.cjs`. Runner logs : `.genos-runner-logs/`. DB : `backend/genos.db` (tables `trinity_worlds`, `agents`, `telemetry_events`, `primitive_execution_journal`).
- Budget : 18 runs ollama locaux, coût $0, ~25 min murales pour 6 missions.

## Conclusion

Trinity réel-fonctionnel comme **machine** (dispatch → mondes scellés → evidence → comparaison → gate) : oui, 6/6. Comme **producteur de bonnes réponses** sur ces 6 missions avec qwen2.5-coder:7b : non — le simulé gagne 6/6 sur le fond, et la barrière a eu raison de ne rien fusionner. Prochains leviers honnêtes : modèle de raisonnement plus fort (ex. `qwen3.8`, `deepseek-r1` disponibles), rôles mieux cadrés (pas des « data engineers » sur de la logique), mémoire scopée par mission, et déblocage d'adapters via le pont pour les variants pareto/adversarial.
