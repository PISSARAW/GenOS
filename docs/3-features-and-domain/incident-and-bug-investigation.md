# Investigation Adaptative et Gestion de Crise

GenOS offre des outils avancés pour l'investigation automatisée et adaptative de bugs et d'incidents complexes, tirant parti de ses capacités de simulation déterministe et d'isolation.

## Adaptive Incident Search (Recherche d'Incident Adaptative)

Lors d'un crash en production, GenOS déploie des univers de fautes déterministes.
Il rejoue les événements précédents dans de multiples univers (par exemple 100), puis identifie les reproductions les plus proches de l'incident et les "fork" récursivement en raffinant les hypothèses.

**Dimensions de mutation appliquées :** Timing, latence, perte de paquets, ordre des événements, isolation des bases de données, concurrence, éviction de cache.
Chaque résultat préserve son vecteur de mutation, son explication et son arête généalogique.

**CLI :**
```bash
genos experiment incident <manifest.yaml>
```
**Outil MCP :** `genos_incident_experiment`

## Unknown-Cause Bug Investigation (Traque de Bugs par Élimination)

L'orchestrateur lance plusieurs correctifs candidats dans des *workspaces* isolés.
Chaque branche subit exactement les mêmes preuves falsifiables (tests, traces). L'espace des hypothèses (`explanation_space`) est intégralement conservé, avec les verdicts et les preuves de chaque monde éliminé, rendant le processus d'investigation transparent et auditable.

**CLI :**
```bash
genos experiment bug-investigation <manifest.yaml>
```
**Outil MCP :** `genos_bug_investigation`
