# Procedural Organism — P0 Fixes (session 2026-09-21)

## Bug 1: episodeHash trie la trajectoire → faux positifs

**Symptôme :** `[A,B,C]` et `[C,B,A]` produisent le même hash.
**Cause :** `canonicalEpisode()` appelait `.sort()` sur la trajectoire.
**Correction :** Supprimer `.sort()`. L'ordre EST la procédure.
**Fichier :** `backend/src/services/proceduralIdentityService.js`

```js
// AVANT (bug)
trajectory: episode.trajectory.map(String).sort()

// APRÈS (fix)
trajectory: episode.trajectory.map(String)
```

## Bug 2: rewardFrom infère evidence=1 à partir du succès

**Symptôme :** `success=1, evidence=0` → `evidence=1`.
**Cause :** `Number(r.evidence) || (success >= 0.8 ? 1 : 0)` — le `||` évalue `0` comme falsy.
**Correction :** Utiliser `clamp01(num(r.evidence))` — ne jamais inférer une métrique d'une autre.
**Fichier :** `backend/src/services/proceduralPlasticityService.js`

```js
// AVANT (bug)
const evidence = clamp01(Number(r.evidence) || (success >= 0.8 ? 1 : 0));

// APRÈS (fix)
const evidence = clamp01(num(r.evidence));
```

## Bug 3: Promotion receipt teste `result.promo` (undefined) au lieu de `result.promoted`

**Symptôme :** Un candidat promu produit un reçu `REJECTED` avec `promotedId=null`.
**Cause :** `createPromotionReceipt()` teste `result.promo` au lieu de `result.promoted`.
**Correction :** Remplacer `result.promo` par `result.promoted`.
**Fichier :** `backend/src/services/proceduralPromotionGateService.js`

```js
// AVANT (bug)
promotedId: result.promo ? candidate?.metadata?.id : null,

// APRÈS (fix)
promotedId: result.promoted ? candidate?.metadata?.id : null,
```

## Bug 4: Mutations produisent un format non canonique

**Symptôme :** `generateVariants()` retourne `{ structure: { nodes, edges } }` au lieu de `{ metadata, structure: { nodes, synapses } }`.
**Cause :** Le modèle de mutation utilisait `edges` au lieu de `synapses`.
**Correction :** Retourner un `ProceduralOrganism` canonique complet.
**Fichier :** `backend/src/services/proceduralMutationSelectionService.js`

```js
// AVANT (bug)
return {
  id: `v-${contentHash(structure)}`,
  parentId: parent.id,
  structure,  // { nodes, edges } — non canonique
};

// APRÈS (fix)
return {
  id: `v-${contentHash(org)}`,
  parentId: parent.metadata?.id,
  operations: [{ op: 'ADD_NODE', target: { id: newId } }],
  organism: org,  // ProceduralOrganism canonique
};
```

## Bug 5: ID primary key = structureHash empêche versioning

**Symptôme :** Deux versions d'une même structure (weights différents) ont le même ID → conflit SQLite.
**Cause :** `id TEXT PRIMARY KEY` où `id` est le hash structurel.
**Correction :** Séparer `version_id` (PRIMARY KEY) de `structure_hash` (colonne séparée).
**Fichier :** `backend/src/services/proceduralPersistenceService.js`

```sql
-- AVANT (bug)
id TEXT PRIMARY KEY,
version INTEGER,

-- APRÈS (fix)
version_id TEXT PRIMARY KEY,
structure_hash TEXT NOT NULL,
state_hash TEXT NOT NULL,
```

## Bug 6: canonicalStructure ignore les conditions

**Symptôme :** `A→B (condition: safe)` et `A→B (condition: always)` ont le même hash.
**Cause :** `canonicalStructure()` n'incluait pas `condition` dans le hash.
**Correction :** Inclure `condition: s.condition || null` dans le hash structurel.
**Fichier :** `backend/src/services/proceduralIdentityService.js`

```js
// APRÈS (fix)
synapses: synapses.map((s) => ({
  from: s.from, to: s.to, type: s.type,
  condition: s.condition || null,  // <-- inclus dans le hash
})),
```

## Prévention

- **Ordre des trajectoires :** Ne JAMAIS trier une trajectoire pour le hashage. L'ordre est sémantique.
- **Métriques indépendantes :** Ne JAMAIS inférer `evidence` à partir de `success`. Chaque métrique a sa propre source.
- **Tests bidirectionnels :** Toute fonction LTP/LTD doit être testée dans les deux sens (augmente/diminue).
- **Schema first :** Toute mutation doit produire un objet conforme à `spec/procedural-organism.schema.json` AVANT d'être persistée.
