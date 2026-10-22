# ADR 0719 — A-Team : durcissement des gates de variantes et feuille de route de l'exécuteur multiteam

- **Statut :** Accepté (partiel — feuille de route)
- **Date :** 2026-10-22
- **Domaine :** orchestration A-Team, variants d'organisation, promotion par preuve
- **Décideurs :** équipe GenOS
- **Lié à :** ADR 0309, ADR 0329, ADR 0438, `docs/02-orchestration/topologies/a-team.md`,
  `docs/02-orchestration/topologies/a-team-politiques-runtime.md`,
  `docs/03-reference/runtime-a-team.md`

## Contexte

Le parcours canonique A-Team (run, WorkGraph, bail CAS, handoffs versionnés, barrière de
preuves, reprise) est implémenté et testé. Les onze variants d'organisation disposent de
politiques et d'évaluations isolées (51 cas d'acceptation verts), mais :

1. Le dispatch générique n'invoque pas `variantExecutionRuntime` ; ses résultats
   `SUCCEEDED` attestent la fin d'une évaluation de contrat, pas l'exécution d'un sous-run
   ni l'autorisation de promotion. `missionCapabilityPlanService` marque le pont
   `promotionEligible: false`.
2. La variante `multiteam` est refusée avant création du TeamRun avec
   `ATEAM_MTS_EXECUTOR_REQUIRED` : aucun adaptateur `executeTeam` vérifié n'est intégré au
   dispatch. Le runner de programme existe, mais `SUCCEEDED` reste fermé
   (`ATEAM_MTS_SUBRUN_PROOF_REQUIRED`) faute de reçus authentifiés pour les sous-runs
   (autorité, membres, budget, lien mission).
3. Plusieurs variantes exposaient un drapeau `promotionBlocked` / `allAssigned` sans que
   ce drapeau constitue une gate effective : `boundary_spanner` (`proposal_required`) et
   `incident_command` (rôles ICS manquants) pouvaient être présentés comme réussis alors
   qu'une condition bloquante persistait.

## Décision

### Durcissement immédiat (implémenté)

- `executeBoundarySpanner` lève `ATEAM_BOUNDARY_PROPOSAL_REQUIRED` tant qu'au moins une
  interface reste en `proposal_required`. Un contrat fourni mais invalide reste un rejet
  fermé (`validateSemanticContract` / `validateEndpointSchemas`).
- `executeIncidentCommand` lève `ATEAM_ICS_ROLES_INCOMPLETE` si
  `mandatory_ics_roles.allAssigned` est faux.

Ces deux changements font d'un drapeau déclaratif une gate effective, conformément à la
règle normative : un refus de variante ne débloque jamais un consumer.

### Feuille de route (à implémenter, par point)

Chaque point fera l'objet d'un commit distinct, sans modifier les droits d'exécution par
politique seule :

1. **P0 — Exécuteur multiteam générique.** Intégrer un adaptateur `executeTeam` au
   dispatch qui déléguer à `executeTeamRun` et à la barrière de preuves, avec une clé
   d'idempotence stable dérivée du programme et de l'équipe. Persister des reçus
   authentifiés de consommation et d'acceptation des contrats inter-équipes (autorité,
   membres, budget, lien mission). N'ouvrir `SUCCEEDED` qu'après vérification du lien
   mission/parent/membres, du statut `COMPLETED/DEBRIEF`, des nœuds et des références de
   preuve. `createProgramSubrun` doit prouver la consommation effective du budget.
2. **P1 — Câblage des variants au dispatch.** Invoquer `variantExecutionRuntime` depuis
   le dispatch (ou un adaptateur) pour : consultation croisée et preuve de consultation
   `cross_functional_pod` avec gate de clôture ; réorganisation effective par phase
   `adaptive` ; mandat temporaire et échéance `tiger_team` / `incident_command` ;
   axes d'autorité et contrôle CAS `matrix_team` ; transfert exclusif et digest/accusé
   `relay_team` ; quorum `expert_committee`. Conserver `promotionEligible` explicite.
3. **P1 — Formation et expertise.** Passer l'analyse sans graphe du lexical au graphe de
   travail ; attester une expertise générale par capacité (VEC) et une capacité outil
   effective dispatchable (RCA), au-delà des contributions de mission et des workers
   `completed`.
4. **P2 — Contamination enrichie.** Vérifier les trois propriétés documentées :
   ownership unique, consultation obligatoire, autorité d'interface.
5. **P2 — Mémoire transactive.** Collecter les mesures de latence/charge et définir les
   seuils avant d'activer la décroissance de confiance et le routage.
6. **P2 — Pareto local.** Définir échelle, provenance et valeurs manquantes des scores
   avant qu'ils participent à une décision ; le recuit simulé reste une option de
   recherche.
7. **P3 — Morphogenèse appliquée**, **budget adaptatif bout-en-bout**, **conformité
   native** (`test_worker_compliance_native_missions.js`).

## Conséquences

### Positives

- Deux variantes (`boundary_spanner`, `incident_command`) ne peuvent plus être présentées
  comme réussies alors qu'une condition bloquante persiste.
- La feuille de route rend explicite le chemin entre l'état actuel (politiques et
  évaluations isolées) et un exécuteur générique vérifié, sans masquer le statut partiel.
- Les invariants normatifs (graphe cyclique refusé, consumer bloqué tant que le producteur
  n'est pas promu, handoff incomplet sans preuve, quatre couvertures séparées avec
  blocage si l'une est nulle, Pareto uniquement sur options substituables) restent la
  référence pour chaque point.

### Négatives

- Le statut global d'A-Team reste **Partiel** : le dispatch générique n'exécute toujours
  pas `multiteam` ni n'invoque automatiquement les variants.
- Les commits futurs doivent conserver `promotionEligible` explicite et ne pas présenter
  un résultat d'évaluation isolée comme un TeamRun promu.

## Vérification

- `node backend/tests/test_ateam_variant_acceptance.js` : 51 passés, 0 échoué.
- `node backend/tests/test_ateam_variant_execution.js` : à relancer après chaque point.
- Gate qualité : `python scripts/ci/check_code_quality.py`.