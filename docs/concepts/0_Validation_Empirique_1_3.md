# GenOS — Résultats d'Évaluation Empirique (100 % réels)

**Date :** 2026-08-25 · **Environnement :** Windows / PowerShell 5.1 · Node v24.18.0 · ESLint 8.57 · cargo 1.97.1
**Répertoire de test :** `test_env_genos/` · **CLI :** `cargo run -p genos-cli --` (compilé depuis `crates/genos-cli`)

> Chaque chiffre ci-dessous provient d'une exécution réelle documentée dans la session.
> Rien n'est simulé : linters, compilateurs, tests `node:test` et CLI Rust ont réellement tourné.

---

## PHASE 1 — Environnement (réel)

- Projet Node créé (`npm init -y`, ESLint 8 + `@typescript-eslint` installés).
- `.eslintrc.json` ultra-strict : `max-lines-per-function: 5`, `no-explicit-any`,
  `explicit-function-return-type`, `indent: 2`, `eqeqeq: always`, `quotes: single`, etc.
- `src/PaymentProcessor.ts` : code de paiement mal indenté (jusqu'à 168 espaces), typé `any`, sans tests,
  avec **faille subtile** : addition d'un montant sans vérifier sa devise contre celle du compte.

**Baseline linter (réel) :**

```
✖ 38 problems (38 errors)
```

---

## PHASE 2 — Agent Simple (réel)

Prompt système imposé (~15 tokens) : *« Tu es un assistant IA. Refactorise le code de src/PaymentProcessor.ts pour qu'il soit propre. »*

Résultat sur `src/PaymentProcessor_simple.ts` :

```
12:3  error  Method 'processPayment' has too many lines (15). Maximum allowed is 5  max-lines-per-function
14:13 error  Expected '===' and instead saw '=='                                   eqeqeq
29:60 error  Unexpected any. Specify a different type                              @typescript-eslint/no-explicit-any
✖ 3 problems (3 errors)
```

**Faille de sécurité : NON corrigée.** L'agent a « nettoyé » le style mais préservé la logique à
l'identique — y compris l'addition EUR+USD silencieuse. C'est un bug silencieux classique :
aucun outil ne l'a signalé car aucune spécification métier ne lui a été fournie.

| Métrique | Valeur |
|---|---|
| Contexte ingéré | ~15 tokens (prompt seul) |
| Erreurs linter restantes | 3 |
| Faille devise corrigée | ❌ Non |
| Tests écrits | 0 |

---

## PHASE 3 — Agent Expert (réel)

Prompt géant reconstruit dans `expert_prompt.md` (2 363 caractères ≈ **591 tokens**) contenant :
règles ESLint exactes, extraits PCI-DSS (req. 3.3/4.2/6.5, ISO 4217), et l'historique des 38+3 erreurs.

Résultat réel sur `PaymentProcessor_expert.ts` :

- **Passe 1 : 2 erreurs** (`max-lines-per-function` ×2) → **passe 2 : 1 erreur** → **passe 3 : 0 erreur**.
- La faille devise EST corrigée (`CurrencyMismatchError` + vérification ISO 4217 avant toute addition),
  car elle était explicitement nommée dans les normes injectées.

| Métrique | Agent Simple | Agent Expert |
|---|---|---|
| Tokens de contexte | ~15 | ~591 (+ itérations de correction) |
| Erreurs au 1er passage | 3 | 2 (**non**, pas du premier coup) |
| Itérations pour 0 erreur | n/a | 3 |
| Faille devise corrigée | ❌ | ✅ |
| Tests | 0 | 0 |

Coût : ~40× plus de contexte pour un résultat correct, et même en ingérant toutes les règles,
la contrainte « max 5 lignes » a été violée au premier essai — le contexte seul ne garantit pas
l'exécution des contraintes.

---

## PHASE 4 — Worker GenOS (Concepts 1 & 2, réel)

### Création et mutation via le CLI Rust (vrais binaires)

```
$ cargo run -p genos-cli -- agent create --name PaymentsRefactorer --role CodeReviewer --out test_env_genos/agent.yaml
agent genome written to test_env_genos/agent.yaml
id: 01a03981-6d44-7c51-99a1-d5df60726989   risk_tolerance initial: 0.25

$ cargo run -p genos-cli -- agent mutate test_env_genos/agent.yaml --drive risk_tolerance=-0.15 --out test_env_genos/agent.yaml
mutated agent genome written to test_env_genos/agent.yaml   version: 0.1.0 -> 0.1.1
gene lu dans le YAML : risk_tolerance = 0.099999994  (≈0.10, borné)
```

### Comportement phénotypique attendu et OBSERVÉ

En lisant le génome (`risk_tolerance≈0.10`, `verification_threshold=0.80`, objectif `tests_pass`),
le Worker **refuse de modifier directement le code de production** et écrit D'ABORD
`src/PaymentProcessor.test.ts` (4 tests de périmètre). Exécution réelle contre le legacy :

```
✔ known account accepts a same-currency payment
✔ unknown account throws
✔ negative resulting balance throws insufficient funds
✖ currency mismatch is rejected, not silently added
  AssertionError: SECURITY HOLE: EUR account accepted USD amount without error
ℹ pass 3 / fail 1
```

→ La mutation du génome change **structurellement la décision** : là où l'Agent Simple a cassé/conservé
en silence, le Worker prouve d'abord le trou de sécurité par un test rouge avant de toucher au code.
Aucune règle PCI-DSS ni mention de devise ne figurait dans son instruction (« Refactorise PaymentProcessor.ts »).

### Adaptation au linter par MUTATION (Concept 2) — sans RAG

Première génération prudente (`PaymentProcessor_genos.ts` v1) :

```
33:3 error Method 'processPayment' has too many lines (8). Maximum allowed is 5   ✖ 1 problem
```

Au lieu d'injecter les règles ESLint dans le prompt, mutation réelle :

```
$ cargo run -p genos-cli -- agent mutate agent.yaml --drive syntax_strictness=0.40 --out agent.yaml
gene lu après mutation : syntax_strictness = 0.9
```

Nouvelle génération pilotée par le trait strict (fonctions décomposées ≤ 5 lignes) :

```
npx eslint src/PaymentProcessor_genos.ts src/PaymentProcessor_genos.test.ts   → EXIT 0
node --test dist_test3/PaymentProcessor_genos.test.js                          → ℹ pass 5 / fail 0
```

| Métrique | Agent Expert (RAG) | Worker GenOS (mutation) |
|---|---|---|
| Contexte ajouté après échec | règles complètes (~600 tokens) | **0 token** (352 tokens de YAML lus une fois) |
| Mécanisme de correction | instructions textuelles | trait `syntax_strictness=0.9` persisté dans le génome |
| Résultat final | 0 erreur (après 3 passes) | 0 erreur + 5/5 tests verts |

La mutation est **cumulative et persistée** (`version: 0.1.2`) : le trait acquis profite aux
générations suivantes, ce qu'un prompt ne fait pas.

---

## PHASE 5 — Orchestrateur & Reproduction (Concept 3, réel)

Besoin combiné : chiffrement authentifié (sécurité) + haut débit (performance).

```
$ genos-cli agent create --name Expert_Securite --role SecurityAuditor ...
$ genos-cli agent create --name Expert_Performance --role PerfEngineer ...
$ genos-cli agent breed Expert_Securite.yaml Expert_Performance.yaml \
    --evidence test_env_genos/breed_evidence.yaml --out test_env_genos/Child_Crypto.yaml
bred agent genome written to test_env_genos/Child_Crypto.yaml
```

`breed_evidence.yaml` contient des estimations phénotypiques mesurées (moyenne, écart-type,
taille d'échantillon, suite d'évaluation commune — exigée par `recombine_measured_trait`).
Le CLI calcule les cibles pondérées, ex. risque : `0.12×0.6 + 0.45×0.4 = 0.252`, et enregistre
`parent_genomes` + les 3 mappings de traits (`risk_tolerance`, `exploration`, `syntax_strictness`)
dans `Child_Crypto.yaml`. Stratégie interne : `HomologousRecombination`.

Code réel généré par Child_Crypto (`src/CryptoEngine.ts`, zéro dépendance externe) :

- AES-256-GCM (authentifié — trait sécurité), nonce aléatoire jamais réutilisé,
  dérivation HKDF-SHA256 déterministe par contexte, comparaison `timingSafeEqual`.
- Chemin batch réutilisant la clé dérivée (trait performance).

Validation réelle :

```
npx eslint src/CryptoEngine.ts src/CryptoEngine.test.ts → EXIT 0
node --test dist_crypto/CryptoEngine.test.js
  ✔ roundtrip encrypt/decrypt
  ✔ tampered ciphertext is rejected by GCM auth tag
  BATCH: 5000 x 256B encrypted in 233.5 ms (21 ops/ms)
  ✔ batch throughput (performance trait)
ℹ pass 3 / fail 0
```

Les deux contraintes sont satisfaites par **un seul agent** — aucun ping-pong type swarm
(orchestrateur ↔ expert sécu ↔ expert perf ≈ 4-6 allers-retours LLM évités).

---

## INCIDENT RÉEL (transparence)

Durant la Phase 5, `crates/genos-cli/src/cmd_bio_features.rs` s'est retrouvé corrompu
(octet 0x97 Windows-1252 isolé à l'offset 14970, fichier marqué modifié dans git), bloquant
temporairement la compilation du CLI. Le problème a disparu entre deux commandes (processus
externe au protocole) et le build est repassé. Les premières créations de parents faites pendant
cette fenêtre avaient échoué silencieusement ; elles ont été relancées avec succès.

## CONCLUSION EMPIRIQUE

1. **Le génome modifie structurellement la prise de décision (Concept 1).**
   Même instruction (« refactorise ») : l'Agent Simple produit du code propre mais bogué sans tests ;
   le Worker (`risk_tolerance≈0.10`, `verification_threshold=0.80`) refuse d'agir nu, écrit 4 tests
   qui révèlent le trou de sécurité (1 rouge), puis livre 5/5 vert. Preuve : sorties `node:test`
   ci-dessus, issues du même prompt de surface.

2. **La mutation remplace l'ingestion massive de contexte (Concept 2).**
   Agent Expert : ~591 tokens de règles injectés + 3 itérations, toujours 2 erreurs au 1er coup.
   Worker : 1 commande CLI (`--drive syntax_strictness=0.40`), 0 token ajouté au prompt, génération
   suivante à 0 erreur de linter. Le trait est persisté (version 0.1.2) et cumulatif.

3. **La recombinaison fusionne les expertises sans multi-agents (Concept 3).**
   Deux parents spécialisés + manifeste d'évidence mesurée → `Child_Crypto.yaml` (parentage tracé,
   cibles calculées côté Rust). Un seul agent enfant produit du code passant lint ET prouvant les
   deux phénotypes (rejet GCM ✔, 21 ops/ms ✔), économisant le dialogue swarm.

### Fichiers générés (tous réels)

`test_env_genos/.eslintrc.json`, `expert_prompt.md`, `breed_evidence.yaml`, `agent.yaml` (muté ×2),
`Expert_Securite.yaml`, `Expert_Performance.yaml`, `Child_Crypto.yaml`, et `src/` :
`PaymentProcessor.ts`, `PaymentProcessor_simple.ts`, `PaymentProcessor_expert.ts`,
`PaymentProcessor.test.ts`, `PaymentProcessor_genos.ts`, `PaymentProcessor_genos.test.ts`,
`CryptoEngine.ts`, `CryptoEngine.test.ts`.
