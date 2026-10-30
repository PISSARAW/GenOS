# Extractions de qualité des workers après campagne Qwen

## Construction du rapport de code

Le dispatch vers le rapport de revue seule est séparé de la construction du
rapport de code dans `workerCodeEvidenceReport`. Les conditions et contenus
restent identiques. La fonction de construction revient de complexité 11 à 10 ;
le dispatch a une complexité de 2. La dette préexistante de la fonction de
spécialisation n'est pas modifiée et aucune baseline n'est ajustée.

Régressions exécutables : `test_worker_code_evidence.js`,
`test_local_code_worker.js` et `test_local_code_review.js` sous `backend/tests/`.
