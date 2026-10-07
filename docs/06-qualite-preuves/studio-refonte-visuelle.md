# Studio — refonte visuelle du 7 octobre 2026

## Portée

La demande d’implémentation suit la comparaison esthétique. Cette tranche
améliore les cinq vues existantes, sans déclarer atteint le programme global
de parité. Référence : [ADR 0352](../adr/0352-studio-composition-et-inspecteurs-de-preuves.md).

## Points livrés

1. Composition commune : navigation latérale, contexte compact, hiérarchie
   primaire/secondaire/destructive, surfaces et typographie unifiées.
2. Inspection et supervision : sélection du run, métriques synthétiques,
   onglets clavier, trajectoire bornée, inspecteurs de preuves et de lignée.
   Les nœuds proviennent uniquement du contrat backend.
3. Workspace : explorateur filtrable et sélection visible, éditeur et
   snapshots côte à côte ; écriture optimiste et brouillons conservés.
4. Laboratoire : observations/actions séparées, filtres de commandes,
   comparaison alignée des métriques et états des jobs.
5. Qualification : tests unitaires, parcours HTTP et navigateur, captures,
   règles d’accessibilité automatisées et contrôles globaux.

Les identifiants et empreintes restent intégralement consultables. Les
mesures absentes ne sont pas remplacées par zéro. Les scores et réponses
positives ne confèrent aucune promotion.

## Méthode et conditions locales

Travail dans le worktree Studio existant, branche
`codex/studio-v3-integration`, base `a3402f60`. Le checkout V3 principal,
ses modifications MCP et sa branche ne sont pas modifiés par cette tranche.

Le module `mcpExecutor/domainVerdict.js` manquant à cette base est copié
temporairement depuis le checkout principal pour démarrer les tests.
Ce travail opérateur ne fait pas partie des commits Studio.
La copie est retirée après qualification ; l’original principal est conservé.
Les restrictions sandbox sur loopback et lancement Edge nécessitent une
relance autorisée des tests hors sandbox ; les essais bloqués ne comptent
pas comme réussites.

Le lock P0 scelle les octets CRLF de quatre assets, tandis que cette base Git
fournit des blobs LF. La première suite globale échoue sur l’intégrité de
`public/code.json`. La relance utilise exclusivement les fins de ligne CRLF
attendues, sans modifier tâches ni lock ; les quatre fichiers sont ensuite
remis en LF. Un checkout neuf de cette base conserve ce défaut préexistant.

Les fixtures isolées passent par HTTP, SQLite et filesystem réels. Les deux
nœuds ajoutés par le parcours de design sont des données de test explicites,
pas des exécutions promues. Les captures d’accessibilité incluent un identifiant
artificiellement long pour éprouver le reflow ; il ne représente pas un ID
habituel en production.

## État de qualification

- `python scripts/ci/check_code_quality.py` : aucune nouvelle violation.
- `python scripts/ci/check_adr_index.py` : 431 entrées, aucun problème.
- `node backend/tests/run_studio_suite.cjs` : 12/12 suites réussies.
- `node backend/tests/test_studio_browser.cjs` : Edge 154.0.4258.62,
  aucune erreur de page ; approbation réelle, refus tenant, historique,
  conservation du brouillon, restore, replay et annulation réussis.
- Onglets clavier, sélection des runs/fichiers, filtres, lineage HTTP/SQLite,
  comparaison et panneaux mobiles exercés.
- Axe 4.13 : aucune violation rapportée pour les cinq vues desktop, mobile
  compact et mobile déplié. Contrôles supplémentaires à 200 % de texte.
- `npm test` : code de sortie 0 sous les conditions locales ci-dessus.
- `cargo test --workspace --offline` : code de sortie 0, cache Rust local.

Les dépendances axe déjà déclarées par le dépôt sont installées pour cette
qualification dans `.genos-tests/design-tools`, sans modifier les dépendances
partagées par les autres chats. En installation complète, `npm ci` à la racine
fournit normalement cette dépendance au parcours navigateur.

Dix captures finales et le reçu `studio-qualified.json` sont conservés dans
`.genos-tests/studio-design-proof/` (ignoré). Les cinq vues desktop et les
cinq vues mobiles ont été inspectées visuellement. Le mobile privilégie les
panneaux progressifs ; les tableaux de comparaison et la lignée utilisent
des régions de défilement nommées et accessibles au clavier.
Les logs des suites globales conservent des avertissements de télémétrie
SQLite dans certaines fixtures ; ils ne sont pas supprimés ni pris pour
des preuves de collecte complète.

Aucun résultat concurrentiel universel ni certification WCAG n’est établi.

## Reste à implémenter et qualifier

Le programme [C05–C26 et S01–S10](studio-parite-plan.md) reste ouvert selon
son suivi existant : workflows visuels, playground, prompts, modèles/outils,
déclencheurs, RAG, télémétrie avancée, gouvernance, collaboration et domaines
GenOS. Le graphe n’est pas un éditeur de workflow, ni un layout causal.
Les benchmarks, fournisseurs réels, Linux/Docker et l’audit complet
d’accessibilité ne sont pas prouvés par ces captures Windows.
