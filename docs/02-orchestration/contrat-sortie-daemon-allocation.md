# Contrat de sortie du daemon d'allocation

- **Statut** : implémenté dans le runtime local Node pour ce contrat métier.
- **Portée** : `resident_daemon` avec un assignment scellé
  `resource_allocation`, mode `observation`, indices depuis zéro.
- **Dernière revue** : 2026-11-04.
- **Décision** : [ADR 0795](../adr/0795-observation-daemon-structuree.md).

## Réponse demandée au modèle

Le schéma fournisseur exige un objet d'observation, sans champ `claims` libre.
Cet exemple illustre une allocation saine ; les valeurs sont produites par le
modèle et ne sont pas des constantes du schéma :

```json
{
  "schema": "genos.daemon-allocation-observation/v1",
  "outcome": "success",
  "observation": {"observedSum":17,"target":17,"anomaly":false},
  "evidence": ["sha256:empreinte-du-probleme", "sha256:empreinte-de-allocation"],
  "uncertainties": [],
  "territoryReport": {
    "territoryId": "allocation.json",
    "observedAt": "2026-11-04T12:00:00.000Z",
    "sourceRefs": ["sha256:empreinte-du-probleme", "sha256:empreinte-de-allocation"]
  }
}
```

Les références réelles sont les SHA256 des sources immuables assignées, sans
doublon ni référence inventée. Le territoire est le fichier d'allocation du
contrat. L'horodatage doit être une date UTC lisible. Il ne constitue pas, à lui
seul, une preuve d'observation.

Le daemon additionne uniquement les éléments de `problem.values` désignés par
`allocation.indices`, puis compare leur somme à la cible. `outcome: success`
signifie qu'il fournit un constat exploitable ; une anomalie n'est pas nécessaire.

Si les preuves manquent, la réponse est :

```json
{
  "schema": "genos.daemon-allocation-observation/v1",
  "outcome": "unresolved",
  "observation": null,
  "uncertainties": ["Source nécessaire indisponible."]
}
```

Les champs supplémentaires, chaînes numériques, booléens sous forme de chaîne,
anciens claims et blocs de code Markdown sont refusés. Il n'existe pas de repli
qui répare une ancienne chaîne `observedSum:...`.

## Passage au dossier et contrôle indépendant

`daemonObservationContract` valide strictement le texte brut contre le schéma
sélectionné depuis `workerContract.assignment`. Il sérialise l'objet
`observation` inchangé dans un unique `claims[0].statement`, avec les références
fournies par le modèle. Les validations d'artefact relisent la même projection.

`report.fullText` garde la réponse originale. `report.daemonObservation` indique
le format, la sérialisation `json-stringify/v1` et `sourceTextSha256`. Les tours
du modèle conservent également la réponse fournisseur. Le runtime ne recalcule
ni la somme ni le booléen à ce stade.

Les deux oracles, `source_recompute` et `cross_check`, relisent les sources
scellées et comparent le constat. Un faux positif bien formé est donc réfuté.
Seul un reçu sémantique accepté permet la
[planification depuis le constat](planification-cooperation-depuis-constat.md).
Les droits, baux, limites de ressources et règles de promotion restent ceux du
contrat de worker ; la projection ne leur ajoute aucun pouvoir.

## Validation et relance

```powershell
node backend/tests/test_daemon_observation_contract.cjs
node backend/tests/test_worker_artifact_response_schema.js
node backend/tests/test_worker_cooperation_planner.cjs
node backend/tests/test_worker_cooperation_live.cjs
```

Les tests d'intégration utilisent un transport contrôlé, les vrais dispatchs,
capsules et oracles. Ils couvrent réparation, arrêt sain, faux positif, plan
mal ordonné et abstention. Ils ne mesurent pas la compétence d'un vrai LLM.

Pour la relance réelle, utiliser un nouveau répertoire absolu sur D:, un modèle
Ollama explicite et les scénarios `incorrect` et `healthy` du
[pilote](planification-cooperation-depuis-constat.md). Garder la révision exécutée,
les réponses brutes, les coûts de toutes les tentatives et les preuves de
fermeture. Si le daemon ou une étape suivante est refusé, conserver ce verdict.

## Limites

Le schéma garantit une forme et des références admissibles, pas l'exactitude
du calcul. Ce contrat ne concerne pas les autres observations métier ou les
daemons déterministes dotés d'un autre contrat. L'activation du format vient de
l'assignation scellée ; une simple mention dans le prompt ne l'active pas.

La [relance réelle du 2026-11-04](../06-qualite-preuves/cooperation-llm-sortie-daemon-2026-11-04.md)
produit deux réponses de forme valide, mais aucun constat admissible : une
abstention hors du périmètre et une somme fausse refusée par les oracles. Les
tests contrôlés passent ; la coopération complète avec ce LLM reste non qualifiée.
