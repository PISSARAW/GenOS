# Studio de référence

Le backend sert ce client à `http://localhost:4000/studio/` après
`npm --prefix backend start`. Il faut une clé active, une organisation, un
projet et un agent appartenant à ce projet. Pour un autre port ou une origine
HTTPS, configurer `GENOS_ALLOWED_ORIGINS` selon la politique backend.

Le client affiche le dernier run de cet agent, ses étapes et métriques
disponibles, le journal de promotion vérifié, les liens de provenance mémoire
et les snapshots du workspace. « Capturer un snapshot » appelle le store réel.
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
