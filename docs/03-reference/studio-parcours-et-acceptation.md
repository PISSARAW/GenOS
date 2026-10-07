# Studio — parcours et acceptation

- **Statut** : Huit lots implémentés ; parcours Windows qualifiés, écarts explicites.
- **Portée** : Studio web et contrats backend requis par les huit lots.
- **Dernière revue** : 2026-10-07.

## Matrice de livraison

| Lot / commit | Parcours et interfaces | Critères de fin |
| --- | --- | --- |
| 1 — périmètre | Contrat présent et ADR 0348 | Huit lots, interfaces, limites et preuves définis |
| 2 — socle | Session, sélection tenant/agent/workspace, inspection | Annulation des lectures obsolètes ; permissions ; run sélectionné conservé ; clavier et écran mobile |
| 3 — supervision | `/api/telemetry/stream`, `/api/dashboard`, inspection et lineage | Flux authentifié ; reconnexion avec resynchronisation ; mesures et inconnus distincts ; graphes depuis les données observées |
| 4 — gestion | control-plane, deploy, workers, commandes | Effets réels, refus serveur, confirmations ; listes tenant ; aucun succès supposé depuis un code HTTP |
| 5 — fichiers | Workspaces, lecture/écriture conditionnelle, diff, snapshots | Chemins et liens confinés ; secrets exclus ; conflit 409 ; restauration réelle |
| 6 — exploitation | Arrêt confirmé, superviseur, diagnostic Rust | Processus gérés observés jusqu'à leur fin ; restart suivi par nouvelle instance et readiness ; bridge versionné et erreurs explicites |
| 7 — recherche | Experiments, evidence-ledger, evals et arena | Protocole/budget persistés ; hypothèses et preuves inspectables ; annulation ; comparaison et rejeu des entrées avec provenance |
| 8 — qualification | Parcours navigateur, suites dépôt et documentation | Cas nominaux/refus, perte réseau, concurrence et reprise ; résultats exécutés par plateforme et écarts visibles |

## Périmètre scientifique

L'interface couvre les contrats exécutables d'expériences, ledger de preuves,
datasets, campagnes, jobs, comparaison et arène. Une expérience est rejouée avec
son protocole et ses entrées ; un résultat de modèle ne devient pas déterministe
par cette opération. Les topologies ou algorithmes encore expérimentaux gardent
leur maturité produit. Leur qualification universelle dépasse le client Studio.

## Environnements et ressources

Les cibles sont Windows x86_64 et Linux/Docker selon le contrat produit. Les
versions réellement exercées sont consignées au lot 8. Le navigateur doit gérer
modules JavaScript, fetch, AbortController et streams. Fournisseurs de modèles
et CLI Rust sont des dépendances explicites ; les capacités indisponibles
affichent leur cause et la procédure de résolution. La haute disponibilité et
macOS restent hors du périmètre annoncé.

## Preuve attendue

Chaque mutation exige une vérification de l'effet persisté ou observé. Les tests
utilisent des données et workspaces isolés, sans modifier les missions utilisateur.
Les lectures refusent le tenant étranger et les preuves altérées. Les commandes
exactes, sorties, versions et identifiants des commits sont conservés dans les
artefacts ignorés. Les gates qualité, npm et Rust sont obligatoires à la clôture.

## Références

- [Qualification exécutée et écarts](../06-qualite-preuves/studio-qualification.md).
- [Runbook Studio](../04-exploitation/studio-exploitation.md).

- [ADR 0348](../adr/0348-studio-modulaire-et-parcours-operateur.md).
- [Contrat produit](contrat-produit-et-completude.md).
- [Client de référence](../../integrations/studio/README.md).
