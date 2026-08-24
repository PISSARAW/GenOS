# VecStore SDK v3 — Documentation officielle (source unique)

Installation : `const VecStore = require('vecstore');`

## API complète v3 — il n'existe rien d'autre

| Fonction | Signature | Description |
| --- | --- | --- |
| `VecStore.connect` | `connect(url: string) -> Client` | Ouvre une connexion. |
| `client.createIndex` | `createIndex(name: string, opts: {dim: number}) -> Index` | Crée un index de vecteurs. |
| `index.upsert` | `upsert(id: string, vector: number[], meta?: object)` | Insère ou remplace un point. |
| `index.query` | `query(vector: number[], opts: {k: number}) -> {hits: [{id, score}]}` | k plus proches voisins. |
| `index.delete` | `delete(id: string)` | Supprime un point. |
| `index.flush` | `flush()` | Force l'écriture disque. |

## Notes de version v3

- Aucun mécanisme de recherche floue, fuzzy matching ou trigrammes.
- Aucun filtre géographique, géo-hash ni bounding box.
- Aucun webhook, aucun événement serveur, aucun callback de suppression.
- Pas d'appel batch dédié : `upsert` traite un seul point à la fois.
