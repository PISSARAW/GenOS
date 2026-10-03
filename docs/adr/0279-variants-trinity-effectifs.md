# ADR 0279 — Variants Trinity effectifs sur le chemin de dispatch

- **Statut** : Accepté
- **Date** : 2026-10-03
- **Domaine** : Trinity, variants, diversité, routage modèle, preuves
- **Décideurs** : GenOS
- **Lié à** : ADR 0087, `docs/03-reference/contrat-produit-et-completude.md` (fiche Trinity « partiel »)

## Contexte

Une campagne réelle (6 missions, 18 agents, modèle local Ollama, 03/10/2026) a montré
que les variants Trinity ne changeaient rien aux mondes exécutés :

1. `compose()` utilise toujours le triplet fixe du profil de domaine ; le variant
   n'ajoute qu'une ligne de texte au prompt. Les trois mondes partagent le même
   modèle, sans recette cognitive distincte.
2. `planDiverseWorlds` / `validateDiversity` ne sont appelés nulle part hors tests.
3. Le pont `dispatch_trinity` passe `availableAdapters: []`, donc tout variant non
   baseline (`heterogeneous`, `adversarial`, `pareto`) est rejeté en fail-closed
   après le spawn de l'orchestrateur (`TRINITY_DESIGN_ADAPTER_MISSING`).
4. La rotation déterministe de modèle (`variantIndex`, voir
   `docs/03-reference/modeles-et-providers.md`) n'est jamais alimentée par Trinity.

La barrière comparative a correctement refusé toute fusion (6/6
`ESCALATE_EXPERIMENT`), mais la divergence promise par les variants n'a jamais eu
lieu en réel.

## Décision

1. `compose()` différencie les membres selon le design expérimental :
   - `diversityPolicy: heterogeneous` → recettes cognitives distinctes par monde
     (`direct`, `planned`, `adversarial`) et calcul du score de diversité
     (`validateDiversity`) joint au reçu, sans blocage ;
   - `objectivePolicy: pareto_orthogonal` → profil d'objectif explicite par monde
     (qualité / efficacité / risque, issus de `DEFAULT_OBJECTIVE_PROFILES`) et
     consigne d'axe dans le prompt ;
   - `interactionPolicy: adversarial_cross_examination` → monde 3 en rôle
     `adversarial_reviewer` (kind `red_worker`) avec contrat de falsification.
2. Chaque membre reçoit `variantIndex` (0, 1, 2), propagé jusqu'au routage modèle
   (`workerLaunchPayload` → `local-codex-runtime` → `modelRouter`), où la rotation
   déterministe s'applique en mode `auto`. Le handler peut assigner des modèles
   distincts par rotation sur `GENOS_TRINITY_MODELS` (liste d'URI, optionnel).
3. Le pont passe `availableAdapters: installedAdapterNames()` au lieu de `[]` :
   le fail-closed reste actif (adapter non installé = rejet), mais les variants
   installés deviennent dispatchables. Précédent : `agentAutonomyPlanService`
   fait déjà ainsi.

## Conséquences

### Positives

- Les variants ont un effet mesurable : recettes, profils, rôles et modèles
  diffèrent réellement entre mondes ; le reçu de diversité rend la
  non-diversité visible au lieu de la masquer.
- Les missions `heterogeneous` / `adversarial` / `pareto` deviennent
  dispatchables via le pont.

### Négatives et limites assumées

- Sans plusieurs modèles disponibles, la diversité provider/modèle reste faible :
  le score le dit au lieu de le cacher.
- La contre-expertise adversarial en deux phases (attaquant nourri des dossiers
  défenseurs, arbitre) n'est pas implémentée : le monde 3 attaque à l'aveugle
  depuis le brief. Suivi requis.
- Le superviseur ne transmet pas encore les profils d'objectifs à la
  comparaison Pareto (les défauts monde 1/2/3 s'alignent déjà sur les trois
  axes quand l'ordre est respecté). Suivi requis.

## Preuves exigées

- Test `backend/tests/test_trinity_effective_variants.js` : recettes distinctes
  et score de diversité joint pour `heterogeneous`, profils distincts pour
  `pareto`, monde 3 `red_worker` pour `adversarial`, `variantIndex` propagé
  dans le payload, adapters installés acceptés.
