# Campagne longitudinale SHEV → endocrinien → GVX

Cette campagne mesure si des lésions SHEV répétées, suivies par le pont
développemental, améliorent ensuite des tâches inédites. Elle réutilise le ledger
GVX append-only et compare deux projets isolés issus du même snapshot : contrôle et
arc physiologique complet.

## Exécutions

- `mode: "protocol"` sert aux tests de contrat et aux adaptateurs synthétiques. Le
  rapport reste toujours `protocol_only` et `benchmarkQualified: false`.
- `mode: "field"` exige au moins cinq fenêtres d'entraînement douloureuses, vingt
  fenêtres held-out sans injection de douleur, des contextes disjoints et un
  calendrier préenregistré d'au moins 72 heures entre le premier entraînement et le
  dernier holdout. Le runner n'exécute pas une fenêtre avant son `scheduledAt`.

L'adaptateur `runWindow` doit exécuter le vrai projet avec le scope, workspace,
intervention et budget reçus. `verifyWindow` doit relire les artefacts, vérifier
indépendamment le résultat et retourner un reçu distinct du producteur. Les deux
adaptateurs sont obligatoires; le runner ne simule pas un runtime de terrain.

Exemple d'intégration côté hôte :

```js
const campaign = require('../../backend/src/services/shev/developmentalLongitudinalCampaignService');
const manifest = campaign.createManifest(preregisteredDesign);
const report = await campaign.runCampaign({ db, manifest, runWindow, verifyWindow });
```

Le manifeste scelle les projets, snapshots, locks, fenêtres, hashes, seuils et
ordre pseudo-aléatoire équilibré. Chaque résultat et chaque rapport terminal sont
persistés dans le ledger GVX. Un arrêt peut être repris avec le même manifeste et
des adaptateurs idempotents.

## Interprétation

Le verdict de terrain requiert un gain held-out d'au moins 10 points, un test exact
apparié au seuil préenregistré, aucune régression au-delà de la marge, des coûts et
durées bornés, des progrès indépendamment confirmés et une clairance endocrine
observée après progrès. Un résultat nul ou négatif reste un résultat valide. Aucun
rapport n'autorise une promotion.

Le test automatisé
`node backend/tests/test_shev_developmental_campaign.js` valide le protocole,
l'idempotence et la reprise après interruption avec des adaptateurs synthétiques;
il ne constitue pas une qualification de terrain.

## Pilote Qwen local

Le pilote `backend/bin/run-shev-qwen-campaign.cjs` effectue dix fenêtres de
lecture seule sur des fonctions de la révision Git `HEAD`, avec le modèle Ollama
Qwen, un oracle de source déterministe, et une condition de traitement qui conserve
les corrections vérifiées des erreurs d'entraînement. Il écrit uniquement dans le
ledger SQLite explicitement fourni :

```powershell
$env:GENOS_SHEV_QWEN_DB = 'C:\path\to\temporary\qwen-campaign.db'
npm --prefix backend run bench:shev-qwen -- --campaign-id qwen-pilot-001
```

Ce pilote est une exécution réelle du modèle sur le code versionné, mais demeure
`protocol_only` : les projets/espaces sont des scopes de benchmark en lecture seule,
le coût monétaire local n'est pas mesuré, et aucun progrès GVX/endocrinien n'est
revendiqué. Il ne remplace pas une campagne de terrain sur des workspaces de projet
réel avec adaptateurs indépendants qualifiés.
