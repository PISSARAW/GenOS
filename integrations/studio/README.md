# GenOS Studio — client opérateur

Le backend sert Studio à `http://localhost:4000/studio/`. Les huit lots sont
implémentés et les parcours ci-dessous sont qualifiés sous Windows ; Linux
reste à exercer. Voir le [bilan de qualification](../../docs/06-qualite-preuves/studio-qualification.md).

## Démarrer

```powershell
npm --prefix backend start
# Pour autoriser le redémarrage suivi par le superviseur natif :
npm --prefix backend run studio:supervised
```

Fournir une clé active, puis sélectionner organisation, projet, agent et
workspace. Pour un autre port ou HTTPS, régler `GENOS_ALLOWED_ORIGINS`.
Le redémarrage Studio exige le superviseur propriétaire et une confirmation admin ;
le lancement cluster historique ne promet pas cette capacité.

Après authentification, le formulaire de clé est masqué et le contexte du
projet reste accessible dans une barre dédiée. Le guide accompagne la première
lecture sans créer d'agent ni exécuter de mission. Les vues sont adressables par
`#/runs`, `#/supervision`, `#/gestion`, `#/fichiers` et `#/laboratoire`.
Un dossier d'exécution peut être référencé par `#/runs/<run-id>` ; son ouverture
exige une session autorisée dans le projet sélectionné. Le lien ne contient
ni clé ni scope et ne sélectionne pas automatiquement un autre tenant.
Précédent/suivant conserve les destinations ; les paramètres URL non supportés
sont retirés. Un identifiant introuvable reste un refus explicite.

## Parcours disponibles

- Inspection : runs, étapes, métriques observées, promotion signée, provenance
  et snapshots réels. La signature et ses preuves restent fournies par l'opérateur.
- Supervision : SSE authentifié et tenant, reconnexion avec resynchronisation,
  dashboard et lineage bornés. Une mesure absente reste inconnue.
- Gestion : organisations, projets, membres, agents, workspaces, fork, workers
  et garage. Le terminal est une palette de commandes contrôlées, pas un shell.
- Fichiers : éditeur UTF-8, versions SHA-256, diff, écriture conditionnelle,
  conservation du brouillon sur conflit ou perte réseau, snapshots et restauration.
- Exploitation : arrêt confirmé des processus suivis, refus des runtimes externes
  non vérifiables, restart avec nouvelle instance prête et diagnostic du CLI Rust.
- Laboratoire : protocoles et entrées, seed et budget déclarés, hypothèses,
  ledger de preuves, contradictions et revues sans promotion implicite.
  Datasets, campagnes, jobs, annulation, comparaison et rejeu des entrées figées.
- Arène : recherche numérique locale, front de Pareto et traces privées au tenant ;
  ce n'est pas une qualification générale des agents cognitifs.

## Garanties et limites

La clé vit uniquement en mémoire, jamais en stockage navigateur ou URL.
Déconnexion et changement de scope annulent les requêtes et effacent données et
formulaires. Les valeurs runtime sont rendues avec `textContent`.
Les permissions affichées ne remplacent pas l'autorisation serveur. Aucun rôle
existant n'a été élargi : un opérateur sans `telemetry:read` voit un refus explicite.

Les listes, réponses d'actions, empreintes de provenance et snapshots de
restauration disposent de fiches métier. Les JSON complets restent accessibles
dans des inspecteurs repliés. Un coût zéro, une garantie fausse et une donnée
inconnue sont distincts. Les cinq vues ont été exercées à 390 et 1440 pixels,
avec labels, navigation clavier, focus des titres et texte agrandi à 200 %.
Cela ne constitue pas une certification WCAG ni un test de lecteur d'écran.
La parité concurrentielle globale reste en cours : voir le
[suivi du programme](../../docs/06-qualite-preuves/studio-parite-suivi.md).

L'éditeur refuse secrets, chemins hors workspace, liens symboliques et liens
physiques. Taille maximale : 256 KiB ; listing borné à 250 fichiers et 5000
entrées. Écritures Studio et restaurations sont sérialisées via SQLite et un
verrou local. Le test à deux processus vérifie un seul gagnant par version ;
un acteur externe modifiant directement le filesystem n'est pas couvert.

Enregistrer ou rejouer un protocole n'exécute pas automatiquement une expérience.
Son budget est déclaré, sans moteur d'enforcement automatique dans ce parcours.
Le rejeu d'évaluation réutilise les cas et la configuration capturés et vérifie
l'empreinte des cas ; il ne rend pas un fournisseur de modèles déterministe.
Les anciens jobs sans capture ne sont pas présentés comme reproductibles.
L'annulation du worker est coopérative entre les cas. Les traces d'arène sont
en mémoire et disparaissent au redémarrage.

## Vérifier et exploiter

```powershell
npm --prefix backend run test:studio
npm --prefix backend run test:studio:browser
```

Le parcours navigateur requiert Playwright et Chromium, ou `B06_BROWSER` pointant
vers un navigateur compatible installé. `GENOS_STUDIO_TEST_ARTIFACTS` choisit
un dossier de preuves ignoré par Git.

Le CLI opérateur conserve l'inspection du dossier vérifié :

```powershell
$env:GENOS_API_URL = 'http://localhost:4000'
$env:GENOS_API_TOKEN = '<clé autorisée>'
.\g.ps1 inspect-run --run-id '<run>' --organization-id '<organisation>' --project-id '<projet>'
```

Une clé, un scope ou une intégrité incorrects provoquent un échec, pas un dossier
présumé valide. Voir le [runbook](../../docs/04-exploitation/studio-exploitation.md),
les [critères d'acceptation](../../docs/03-reference/studio-parcours-et-acceptation.md)
et le bilan pour les écarts restants.
