# Studio — surfaces dominantes, 10 octobre 2026

## Portée

Implémentation de la direction visuelle choisie après recherche sur les interfaces
publiques des concurrents. Ce lot conserve les API et l'identité GenOS. Il ne
certifie pas une parité universelle ni toutes les fonctionnalités du programme
[de parité](studio-parite-plan.md). Décision :
[ADR 0390](../adr/0390-studio-surfaces-dominantes-et-inspecteurs.md).

Les patterns retenus sont le canevas dominant et la palette contextuelle des
constructeurs, la sélection liste/détail des outils d'observabilité, et la
référence explicite des outils d'évaluation. Les mondes, lignées, AgentDNA,
provenance, reprise et gates de preuve restent identifiés comme concepts GenOS.

## Livré

- Navigation en cinq familles et sélecteur mobile équivalent ; contexte et aide
  dans l'en-tête, titres répétés visuellement retirés sans supprimer leur sémantique.
- Canevas avec palette repliable, placement par dépendances et zoom fonctionnel.
  Le zoom ne modifie pas le JSON. Les cycles ont un placement de repli ; les ports
  dessinés ne constituent pas un contrat de typage ou une validation serveur.
- Inspecteur latéral non modal sur ordinateur, modal sous 1000 px, avec champs
  pertinents au type, fermeture clavier et maintien des gardes de brouillon.
- Collections avec filtre, sélection clavier et détail ; états inconnus et champs
  autorisés conservés, sans remplacer une absence de verdict par un succès.
- Comparaison avec premier candidat marqué comme référence, en-têtes fixes et
  valeurs manquantes explicites. Résultats du laboratoire et dernière réponse
  d'action séparés pour ne pas juxtaposer des dossiers de contextes différents.
- Alertes lisibles dans l'en-tête, sans recouvrir les commandes de projet.

Le défilement global n'est pas nécessaire dans l'enveloppe connectée testée.
Les grands graphes, dossiers, éditeurs et formulaires restent défilables localement.
Ce lot n'ajoute pas de minimap, déplacement libre, undo/redo ou portage cloud.

## Qualification exécutée

Worktree `studio-product-parity`, branche `codex/studio-product-parity`, base
`9f034ecf`. Les changements non liés du checkout principal V3 sont conservés.
Les tests navigateur réels utilisent des bases, scopes et workspaces temporaires ;
le test foundation utilise explicitement des réponses API de fixture.

- Contrôle qualité : 5685 fichiers, une violation du baseline, aucune nouvelle.
- Index ADR : 468 fichiers et entrées, aucun problème.
- Suite Studio : 29/29 réussies, avec CLI compilé de ce worktree fourni via `GENOS_BIN`.
- Builder : sauvegarde et historique réels, worker structurel, trois spans,
  conflit concurrent, immuabilité publiée, passage vers la publication et purge.
- GenOS et mécanismes spécialisés : parcours API réels, analyses sourcées,
  mutation native du génome, refus et limites conservés.
- Production : gel réel, staging, revue, invocation locale, rollback et retour persisté.
- Foundation : sélection/filtre/clavier des dossiers, états inconnus, texte littéral
  sans injection HTML, gardes de contexte, effet réseau incertain et purge 401.
- Density : les 12 vues en 1440 × 900, 1280 × 720 et 390 × 844 ; texte à 200 %,
  un seul volet actif, brouillons conservés, zoom immuable et inspecteur non modal/modal.
- Navigateur élargi : approbation, provenance, snapshot, refus tenant, restauration,
  rejeu/annulation, historique et déconnexion. Axe 4.13 ne rapporte aucune violation
  sur les 12 vues desktop/mobile et les inspecteurs de nœud ouverts.

Les dépendances d'audit déjà déclarées par le projet sont installées uniquement
dans `.genos-tests/design-tools/`, ignoré, et chargées via `NODE_PATH`. Edge
154.0.4258.62 est utilisé. Aucune certification WCAG, lecteur d'écran, Linux,
qualité d'un LLM externe ou déploiement cloud n'est déduite de ces contrôles.

## Régressions détectées et limites globales

Le guide se réouvrait dans l'en-tête avant connexion, puis son repli au pointerdown
déplaçait le bouton avant mouseup. Aucun submit n'était envoyé. Le guide compact
reste désormais fermé par défaut et son ouverture ne déplace plus le formulaire.
La cascade CSS réaffichait toute la navigation sur mobile ; corrigée. Une alerte
fixe mobile recouvrait le contexte ; remplacée par une ligne d'en-tête.

`npm test` global échoue dans le sandbox avec des accès loopback refusés (`EACCES`)
et des avertissements de base opérationnelle inaccessible ; aucune relance élevée
n'est utilisée pour ce gate global tant que cette base n'est pas isolée.
Le premier `cargo test --workspace` est bloqué à la compilation native par un
accès refusé. Après compilation du CLI, une seconde exécution atteint les tests
et échoue sur `commands::platform::world_path_tests::accepts_simple_id`
(70 autres tests CLI réussis). Le même test isolé hors sandbox réussit : cela
explique cet échec local, mais ne qualifie pas toute la suite Rust.

## Artefacts et rejeu

Les captures finales et rapports sont sous `.genos-tests/studio-density/` et
`.genos-tests/studio-design-final/`, non versionnés. Le rapport density contient
les empreintes des assets ; elles sont comparées aux sources livrées. Les autres
rapports qualifient leur tranche au moment de l'exécution, pas implicitement tout
le dépôt. Un HEAD de base ne signifie pas que les modifications capturées étaient
déjà committées.

Rejouer `npm --prefix backend run test:studio`, puis les scripts
`test:studio:builder`, `test:studio:foundation`, `test:studio:genos`,
`test:studio:specialized`, `test:studio:production`, `test:studio:density` et
`test:studio:browser`. Fournir le CLI compilé via `GENOS_BIN`, Playwright/Edge et
axe via l'installation normale du dépôt ou le dossier d'audit isolé.

Le checkpoint agent `snap-f6222144652a4cbd80a3a1b36cb2bba7`, la décision
`decision-7b23b2c2-a474-427c-9369-92efa394f719` et l'expérience
`b03c2aa3-5892-42d3-b52e-3c8040f308f1` sont réellement persistés dans GenOS.
Ils ne sont ni un backup de worktree, ni un reçu de promotion, ni une preuve
de l'activation des hooks de contrôle de commandes.
