# Échec de validation — littéral de source dans un template (2026-10-22)

Commande : `node --check benchmarks/identity-challenge/runtime-llm.cjs`.

Résultat : échec de syntaxe `Unexpected identifier 'worker_self'`. La consigne C avait entouré la référence `worker_self` de backticks à l’intérieur du template literal JavaScript du scénario; ces backticks terminaient prématurément le template. Aucun agent n’a été lancé avec cette version. Les quatre tests ciblés d’identité et de provenance, ainsi que les deux `--check` du runtime, passaient.

Le runner sera corrigé puis revalidé avant commit du protocole v3.1.
