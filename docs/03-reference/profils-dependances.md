# Profils de dépendances

> **Statut** : référence implémentée  
> **Dernière revue** : 2026-11-14

GenOS propose deux installations reproductibles. Le profil `full` reste le profil
compatible : il installe toutes les dépendances auparavant fournies par les trois
commandes `npm ci`. Le profil `core` installe le runtime principal sans les
dépendances de développement, puis retire les capacités directes optionnelles.

```powershell
npm run install:full
npm run install:core
```

Les deux commandes installent successivement la racine, `backend/` et `mcp/` avec
leurs fichiers de verrouillage. Le catalogue canonique est
`shared/dependencyProfiles.json`. Un inventaire de l'installation courante est
disponible avec `npm run deps:inventory`.

Le profil `core` ne passe pas `--omit=optional` à npm : cette option supprimerait
aussi les binaires de plateforme transitifs de `sqlite-vec`, ONNX ou Sharp. Il retire
uniquement les paquets directs listés dans le catalogue après l'installation
verrouillée. Cette méthode préserve le socle natif, au prix d'un téléchargement
initial plus important que la taille finale installée.

## Capacités

| Capacité | Paquets optionnels | Comportement sans le paquet |
| --- | --- | --- |
| Analytique | `duckdb` | agrégations SQLite prises en charge |
| Graphe | `@ladybugdb/core` | parcours SQLite CTE borné |
| Vecteurs candidats | `@lancedb/lancedb` | `sqlite-vec` reste canonique |
| Audits web | Playwright, Axe, Lighthouse, Chrome Launcher | résultat `inconclusive` explicite |
| Parcours web | Playwright | résultat `inconclusive` explicite |
| Browser Scout | Puppeteer | erreur de capacité indisponible explicite |

Les replis ne prouvent pas une équivalence fonctionnelle générale. Le planificateur
ne route vers un moteur spécialisé que lorsque sa capacité a été détectée. Une
absence de navigateur ne peut pas produire un audit confirmé.

## Inventaire du 14 novembre 2026

Mesure locale avant séparation des profils, sur Windows x64 avec les dépendances
complètes déjà installées :

| Ensemble | Taille installée | Fichiers |
| --- | ---: | ---: |
| `node_modules/` racine | 40,2 Mio | 3 092 |
| `backend/node_modules/` | 1 116,8 Mio | 19 495 |
| DuckDB, LadybugDB et LanceDB, répertoires directs | 115,7 Mio | 6 037 |
| Playwright, Puppeteer, Lighthouse, Axe et Chrome Launcher, répertoires directs | 27,6 Mio | 1 300 |

Ces valeurs décrivent les répertoires directs et ne constituent pas la taille isolée
de leur graphe transitif. Elles servent de référence ; une installation propre de
chaque profil doit être mesurée séparément avant d'annoncer un gain de distribution.

Une installation `core` propre réalisée avec les verrous modifiés donne :

| Ensemble | Profil `core` | Profil complet observé |
| --- | ---: | ---: |
| Racine | 41,2 Mio, 828 fichiers | 40,2 Mio, 3 092 fichiers |
| Backend | 345,7 Mio, 8 757 fichiers | 1 116,8 Mio, 19 495 fichiers |
| MCP | 16,0 Mio, 3 645 fichiers | même graphe runtime |

Les six paquets optionnels contrôlés étaient absents du profil `core`, tandis que les
binaires `sqlite-vec` et ONNX restaient présents. La comparaison réduit d'environ
66 % le total racine et backend observé ; elle dépend
de la plateforme, des versions verrouillées et des binaires natifs disponibles.

L'inventaire confirme aussi trois bibliothèques d'accès SQLite dans le backend :
`sqlite` enveloppe `sqlite3`, tandis que `better-sqlite3` reste consommé par dix-huit
fichiers de production. Son retrait relève de la migration asynchrone ultérieure et
ne fait pas partie de ces profils.

## Vérification

Le contrôle minimal couvre le catalogue, le chargement différé et les refus lorsque
les paquets sont absents :

```powershell
node backend/tests/test_optional_dependency_profiles.js
node backend/tests/test_mcp_registry_without_browser_dependency.js
```

Le profil complet reste soumis aux suites web, stockage et backend habituelles.
