# ADR 0348 — Élimination de la dette historique de qualité

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Domaine** : Qualité, services, orchestration
- **Décideurs** : Mainteneur du dépôt
- **Lié à** : [ADR 0344](0344-refactorings-qualite-et-frontieres-de-controle.md)

## Contexte

La demande concerne les 86 violations historiques du contrôle de qualité.
Un reset concurrent du checkout partagé a rétabli un état comportant 105
violations. Les corrections sont réalisées dans un worktree isolé basé
sur `31bb48a078672c4930ec3c2bb8f1cfb9b5029e11`.

## Décision

Séparer les responsabilités des fonctions trop complexes : normalisation des
entrées, dispatch des actions, collecte des résultats, persistance et refus.
Les contextes explicites regroupent les paramètres sans modifier les API publiques.

Extraire la sonde CLI des handlers biologiques, les critères et entrées de
sélection morphogénétique et les rapports des mondes Trinity. La vérification
des candidats Trinity reste distincte de leur création : les signatures,
hashes, contrôles statistiques et transactions sont conservés.

Les grands tests sont découpés en scénarios en conservant leurs assertions,
leurs jeux de données et leur nettoyage. Le fixture de complétion du banc
biologique fournit la vérification d'état exigée par le runtime ; un cas négatif
garantit qu'une couverture sémantique seule ne suffit pas.

Ne pas modifier le gate, ses seuils ou la baseline. Le contrôle strict valide
l'ensemble des sources, y compris les anciennes exceptions.

## Conséquences

Les responsabilités deviennent testables séparément. Aucun bail MCP, confinement,
refus de sécurité ou contrat de promotion n'est supprimé. Le nombre de fonctions
internes augmente ; les modules publics restent compatibles.

Le contrôle strict confirme zéro violation. Les résultats exécutables des suites
et les limites de validation sont enregistrés avec le commit ; ce résultat ne
constitue pas une certification de toutes les capacités du système.

### Vérifications du 7 octobre 2026

- `python scripts/ci/check_code_quality.py --strict` : 5 359 sources, zéro violation.
- `npm test` : succès de la chaîne biologique, backend et Garage.
- `cargo test --workspace` : succès, avec le cache de compilation existant via
  `CARGO_TARGET_DIR` après suppression du seul cache temporaire de ce worktree.
- `npm --prefix backend run test:quality` : 12 tests réussis.
- Suites Trinity, MCP et gRPC : respectivement 36 tests, 6 suites et 41 services.
- Suite morphogenèse : 40 tests réussis ; benchmark SWE : 15 tests réussis.
- Comparaison avec le code de base : 19 608 entrées équivalentes par parseur CLI ;
  indices, compteurs et traces des solveurs conservés.
- Index ADR et vérification de syntaxe des fichiers modifiés : succès.

La validation étendue `test:validation` reste en échec dans
`test_argumentation_runtime.js` : une propriété `claim` est lue sur une valeur
absente dans l'étape Biocénose `review_and_verify`. Deux tests historiques ciblés
restent aussi en échec : `test_agent_dossier.js` attend une mission différente,
et `test_chromatin_locking.js` attend un ancien message de refus.
Ces trois échecs sont reproduits en rechargeant les modules modifiés depuis
`HEAD` dans le processus de test, sans remplacer les fichiers du worktree.
Ils ne sont pas des régressions de cette extraction et ne sont pas masqués.

## Alternatives

Augmenter la baseline ou les seuils masquerait la dette et est rejeté.
Réécrire les algorithmes modifierait inutilement les comportements ; les
extractions ciblées sont privilégiées.
