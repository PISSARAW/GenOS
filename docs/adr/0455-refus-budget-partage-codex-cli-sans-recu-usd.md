# ADR 0455 — Refuser le budget partagé de Codex CLI sans reçu USD

## Contexte

Le runtime `genos-agent-runtime.cjs` lance `codex exec --json` dans un
sous-processus. Il lit les tokens éventuellement rapportés et un champ
`cost_usd` facultatif. En l'absence de ce dernier, le comptage existant
ajoute zéro. Cette valeur ne prouve pas que l'appel n'a rien coûté.
Le runtime ne crée pas non plus de réservation SQLite avant l'appel.
Deux workers pourraient donc consommer simultanément le même plafond parent.

Le runtime local utilisant `subprocessModelBudgetRoute` dispose, lui, d'une
autorité de scope vérifiée dans SQLite et d'une réservation avant l'appel
modèle. Le bridge Codex CLI ne possède pas de contrat équivalent permettant
de mesurer en USD et de borner chaque tentative avant son lancement.

## Décision

Quand l'enveloppe de mission fournit `modelBudgetScopeJson`, le bridge Codex
CLI vérifie d'abord le scope et les plafonds enfants dans la base partagée via
`subprocessModelBudgetRoute.openForMission`. Il ferme la connexion, émet
`AGENT_HALTED` avec `MODEL_BUDGET_GUARD` et sort avec un code non nul avant de
préparer ou lancer Codex CLI. Un scope forgé, une base absente ou un budget
enfant invalide conservent l'erreur `MISSION_MODEL_BUDGET_SCOPE_INVALID`.

Le refus d'un scope valide porte le code
`CODEX_CLI_SHARED_BUDGET_UNSUPPORTED`. Aucun token ou coût n'est attribué à
la mission refusée et aucune réservation n'est créée. Le chemin sans scope
explicite reste celui du runtime existant; ses estimations ne deviennent pas
des reçus de budget partagé.

## Vérification et reprise possible

`node backend/tests/test_codex_cli_shared_budget.js` démarre deux vrais
sous-processus sur une même base SQLite : ils refusent le scope valide avant
le lancement de l'exécutable modèle, sans réservation ni usage synthétique.
Le test couvre aussi un parent forgé et une base absente.

Pour ouvrir ce chemin, il faudra un reçu d'usage mesuré avec coût USD par
tentative, une borne maximale de coût et de tokens connue avant l'appel, une
réservation atomique dans le scope parent, puis la réconciliation des appels
interrompus ou dont le reçu arrive tardivement. Un simple nombre de tokens
dans `turn.completed` ou un coût absent interprété comme zéro ne suffit pas.
