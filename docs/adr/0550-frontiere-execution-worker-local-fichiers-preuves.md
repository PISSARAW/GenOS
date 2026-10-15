# ADR 0550 — Frontière d'exécution du worker local : fichiers injectés, capsule stricte, preuves exigées

- **Statut** : Accepté.
- **Date** : 2026-10-15
- **Domaine** : Runtime worker local, sandbox, contrats de preuve.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0510 (budgets du runtime Codex), ADR 0512 (budget CPU du runtime worker Node), ADR 0022b (résultats opérationnels et preuve).

## Contexte

Qualification réelle avec `qwen2.5-coder:7b` : le worker local (`executor: local`)
recevait un prompt one-shot lui affirmant qu'il « ne peut pas ouvrir lui-même les
fichiers », ne voyait que les NOMS de fichiers, et ne pouvait ni écrire ni
exécuter de commande. Lecture traçable (N3) et correction+test (N4) étaient donc
structurellement impossibles, et le modèle a produit de fausses déclarations de
succès (« corrigé », « tests réussis ») sans diff ni sortie. Le prompt mentait
sur les capacités du worker, et aucun contrat n'invalidait ces déclarations.

## Décision

Nouvelle frontière d'exécution, mise en œuvre dans trois fichiers exclusifs :

1. `backend/bin/local-codex-runtime.cjs` — le runtime injecte dans le prompt le
   CONTENU des fichiers pertinents de la capsule (racine, 12 fichiers max,
   32 Ko/fichier, 128 Ko total). Chaque extrait est accompagné de son `sha256`,
   à citer pour toute lecture utilisée. Au-delà des plafonds : refus explicite
   (`too_large`, `budget_exceeded`) avec le hash, sans contenu. La lecture est
   confinée (résolution + `lstat`, liens symboliques refusés, mémoire bornée
   par lecture en flux de 64 Ko). Les blocs `[ARTIFACT: chemin]...[/ARTIFACT]`
   de la réponse sont appliqués STRICTEMENT dans la capsule via
   `localArtifactWriter` (tout échappement lève une erreur, fail-closed). Si
   `executionPolicy.allowedCommands` contient la commande demandée ET que
   `sandboxCommandPolicy` l'allowliste, elle est exécutée via
   `sandboxExecutor.runIsolated` dans la capsule ; `exit_code`, `stdout` et
   `stderr` tronqués sont joints au dossier avec une référence
   `genos://code-test/<digest>`. Tout refus (`not_in_allowed_commands`,
   `not_allowlisted`, `executor_refused`) est enregistré sans exécution.
   Avant inspection du contrat, le runtime REMPLACE `tests` par les preuves
   réellement exécutées : une sortie fabriquée par le modèle ne survit pas.
   Le prompt ne prétend plus l'impuissance du worker et interdit de déclarer
   « corrigé » ou « tests réussis » sans diff ni sortie prouvée.
2. `backend/src/services/sandboxCommandPolicy.js` — allowlist étendue
   prudemment à `node <script-test>.js` et `node --test <script>` : script
   relatif `.js`/`.mjs` dont le nom contient `test|spec|check|verify`, sans
   `..`, sans chemin absolu, sans drapeau (`-e`, `--inspect`, … refusés).
   Aucun shell libre, aucun contournement du confinement de paths : les
   consommateurs existants (`sandboxExecutor`, `localCodeWorkerService`)
   gardent leurs propres gardes (double gate, fail-closed).
3. `backend/src/services/agents/workerArtifactContract.js` — pour les dossiers
   des kinds d'exécution (`bounded_worker`, `adaptive_worker`, `specialist`,
   `procedural_executor`, `symbiotic_worker`), toute déclaration de succès de
   type « corrigé / tests réussis / fix / tests pass » exige une preuve
   correspondante : référence `genos://code-test/<digest>` liée
   cryptographiquement à une entrée `tests` au `exitCode` 0 du même contenu,
   ou `codeVerification.artifactContentHash`, ou référence `sha256:<hex>`
   d'un fichier réellement injecté (`provenance.readFileHashes`). Sinon le
   dossier est INVALIDÉ (`dossier.code_fix.unsubstantiated`), à l'inspection
   comme à la promotion (`INVALID_WORKER_ARTIFACT`). Les autres kinds et les
   dossiers sans déclaration de succès sont inchangés.

## Conséquences

### Positives

- Le worker local voit le contenu réel et traçable des fichiers (N3 possible).
- Correction+test (N4) devient exécutable : écriture capsule + `npm test`
  sandboxé + preuves jointes, démontré sans LLM par
  `backend/tests/test_local_worker_file_capabilities.js` sur une capsule
  fixture (`backend/tests/fixtures/local-worker-capsule/`, bug + test).
- Un dossier « corrigé/tests réussis » sans diff ni sortie est désormais
  rejeté par le contrat aux deux gates (inspection et promotion).
- Aucune exécution hors allowlist, aucune écriture hors capsule, aucun appel
  LLM dans les tests ; budgets mémoire d'injection bornés.

### Négatives et limites

- Le modèle ne peut plus déclarer le succès lui-même : il doit demander les
  tests et laisser le runtime prouver. Une réponse brute qui affirme le succès
  sans preuve échoue la validation de génération (3 essais puis échec fermé
  de la mission, pas de faux succès).
- `node <script>` allowlisté par la politique n'est pas exécutable par
  `sandboxExecutor` (qui ne connaît que npm/cargo/pytest/echo) : le runtime
  enregistre alors `executor_refused` sans exécuter. L'extension profite aux
  consommateurs à spawn direct (`localCodeWorkerService`).
- La liaison preuve/digest garantit la cohérence interne du dossier, pas
  l'origine cryptographique des sorties hors chemin runtime (signature des
  reçus hors périmètre) ; le chemin runtime remplace les `tests` déclarés,
  ce qui ferme la forge simple.
- Fichiers binaires injectés tels quels en UTF-8 (pas de détection
  mime) ; 12 candidats max à la racine, pas de descente récursive.
- Ligne d'index de `docs/adr/README.md` à ajouter par le mainteneur de ce
  fichier (hors périmètre exclusif de ce chantier).

## Alternatives

- Laisser le prompt déclarer l'impuissance et valider les dires du modèle :
  rejeté, c'est le défaut prouvé qui motive ce chantier.
- Exécuter les commandes du modèle sans double gate (confiance au bail seul) :
  rejeté, contournement potentiel du confinement.
- Shell libre dans la capsule : rejeté, surface d'échappement injustifiable.
- Preuves purement déclaratives (refs non liées aux sorties) : rejeté, elles
  se forgent aussi facilement que les déclarations qu'elles prétendent étayer.

## Vérification

- `node backend/tests/test_local_worker_file_capabilities.js` : lecture+hash,
  refus `too_large`/`path_escape`, écriture capsule seule, `npm test`
  sandboxé en échec puis en succès après correctif, refus hors allowlist, et
  INVALIDATION d'un dossier « corrigé/tests réussis » sans preuve puis
  acceptation du même dossier augmenté des preuves runtime.
- `node backend/tests/test_local_artifact_policy.js`,
  `node backend/tests/test_worker_code_evidence.js`,
  `node backend/tests/test_local_code_worker.js`,
  `node backend/tests/test_worker_contract_enforcement.js`,
  suites sandbox/AEIS concernées, et
  `python scripts/ci/check_code_quality.py` sans nouvelle violation.
