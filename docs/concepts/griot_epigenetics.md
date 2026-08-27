# Plasticité Épigénétique de l'Agent Griot

La plasticité épigénétique permet à l'agent Griot de modifier la structure de son "génome" en fonction des variables environnementales et de son expérience.

## Effet de l'Environnement

L'environnement de Griot est défini par ses dossiers, ses configurations et le contexte des requêtes. 
En fonction de ces variables, le génome subit des modifications (structure de la chromatine) à des locus précis :

- **Ouverte (open)** : Les modules (ex: `communication_module`, `creativity_module`) deviennent actifs. Ceci se produit lorsque l'agent détecte des répertoires de recherche (ex: dossiers `research/`) ou des environnements de développement libres.
- **Fermée (closed)** : Les locus sont réduits au silence. L'agent restreint ses capacités créatives si l'environnement exige de la sécurité, par exemple en présence de configurations strictes ou de répertoires liés à la production (`deploy/`, `configs/strict.json`).
- **Méthylée (methylated)** : Une répression durable d'un locus. Si un module échoue de manière répétitive ou qu'une règle de sécurité absolue est en place (ex: `SECURITY.md`), le locus correspondant est méthylé pour l'inhiber de façon persistante.

## Outils d'Interaction

Ces états peuvent être contrôlés ou mesurés via l'outil MCP `genos_biomimicry_epigenetic_chromatin`, qui prend trois paramètres :
- `agent_id`
- `locus`
- `state` (`open`, `closed`, ou `methylated`)

Cette conception biomimétique offre une flexibilité de contexte accrue, permettant à l'agent Griot de s'adapter organiquement à son écosystème logiciel.
