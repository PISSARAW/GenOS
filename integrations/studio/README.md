# Studio de référence

Le backend sert ce client à `http://localhost:4000/studio/` après
`npm --prefix backend start`. Il faut une clé active, une organisation, un
projet et un agent appartenant à ce projet. Pour un autre port ou une origine
HTTPS, configurer `GENOS_ALLOWED_ORIGINS` selon la politique backend.

Le client affiche les runs de cet agent (recherche par identifiant, état ou
raison), leurs étapes et métriques disponibles, le journal de promotion
vérifié, les liens de provenance mémoire et les snapshots du workspace.
« Capturer un snapshot » appelle le store réel.
Un dossier JSON signé peut être soumis au contrôleur de promotion existant.
La clé de signature reste chez l’opérateur : elle n’est ni fournie ni fabriquée
par le navigateur. Le serveur refuse une signature ou des preuves manquantes.

La clé d’accès vit uniquement en mémoire de la page. Aucun stockage navigateur
ne la conserve. Déconnexion et refus de lecture effacent les données affichées.
Les réponses de provenance ne contiennent pas les secrets du journal scellé.
Les données sont rendues avec `textContent`, sans HTML fourni par le runtime.

Il s’agit d’un client de supervision des parcours implémentés. La diffusion
temps réel, l’édition de fichiers et les nouvelles fonctions scientifiques de
la matrice de recherche ne sont pas déduites de cet écran.

Le CLI opérateur relit le même dossier vérifié :

```powershell
$env:GENOS_API_URL = 'http://localhost:4000'
$env:GENOS_API_TOKEN = '<clé autorisée>'
.\g.ps1 inspect-run --run-id '<run>' --organization-id '<organisation>' --project-id '<projet>'
```

La commande retourne le dossier JSON ou un code d’échec lorsque la clé,
le scope ou l’intégrité ne permettent pas la lecture.

## Validation navigateur

Playwright est une dépendance de développement du backend. Après `npm ci` à
la racine et `npm ci --prefix backend`, le parcours complet se lance depuis
n’importe quel dossier avec Edge installé, sans configuration supplémentaire :

```powershell
npm --prefix backend run test:b06-clients
```

Un autre navigateur Chromium peut être choisi avec `B06_BROWSER_CHANNEL` ou
un exécutable précis avec `B06_BROWSER`.

Le harnais crée automatiquement `artifacts/b06-client-journey` (ou utilise
le dossier fourni en premier argument). Il vérifie aussi les réponses 401,
non JSON, les délais dépassés, les pertes réseau et le double-clic sur
Actualiser. Le client VS Code est testé lorsqu’il est disponible ; pour
exiger sa présence et échouer si VS Code est absent ou en cours de mise à
jour, définir `B06_REQUIRE_IDE=1`.
