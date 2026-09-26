# Inventaire technique vérifiable

Généré le 2026-09-26 par `node scripts/docs/generate-technical-inventory.js`.

Ces mesures comptent les éléments définis dans la colonne « Méthode ». Elles décrivent le dépôt au moment de la génération ; elles ne mesurent ni la maturité, ni l'état de santé, ni la disponibilité runtime.

| Mesure | Valeur | Méthode reproductible |
| --- | ---: | --- |
| Fichiers JavaScript de services (directs / récursifs) | 541 / 1750 | Fichiers `.js` directement sous `backend/src/services`, puis sous-arborescence comprise |
| Fichiers JavaScript de contrôleurs (directs / récursifs) | 55 / 68 | Fichiers `.js` directement sous `backend/src/controllers`, puis sous-arborescence comprise |
| Stratégies déclarées | 92 | Familles de stratégies importées par le module strategyRegistry.js |
| Références à des primitives / identifiants distincts | 255 / 226 | Somme des tableaux `primitives` du registre / union de ces tableaux |
| Outils MCP déclarés | 176 | Noms distincts dans `MCP_TOOLS_LIST` de `backend/src/db/seedTools.js` |
| Handlers biomimétiques enregistrés / fichiers sources | 101 / 89 | Clés de `TOOL_HANDLERS` / fichiers `.js` directs dans `mcpBioTools/handlers` |

Les outils publics exposés par le serveur MCP peuvent former un sous-ensemble dépendant des leases et de la configuration. Les fichiers ne correspondent pas forcément un à un aux services, contrôleurs ou handlers enregistrés. Aucun total de tests n'est publié ici : leur décompte n'est pas normalisé par ce générateur.
