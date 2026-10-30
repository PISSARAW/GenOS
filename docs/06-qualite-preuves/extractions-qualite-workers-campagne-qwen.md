# Extractions de qualité des workers après campagne Qwen

## Construction du rapport de code

Le dispatch vers le rapport de revue seule est séparé de la construction du
rapport de code dans `workerCodeEvidenceReport`. Les conditions et contenus
restent identiques. La fonction de construction revient de complexité 11 à 10 ;
le dispatch a une complexité de 2. La dette préexistante de la fonction de
spécialisation n'est pas modifiée et aucune baseline n'est ajustée.

Régressions exécutables : `test_worker_code_evidence.js`,
`test_local_code_worker.js` et `test_local_code_review.js` sous `backend/tests/`.

## Liaison du snapshot dans le reçu de test

La projection facultative de `reviewSnapshot` est extraite de
`recordExecutedBatch`. Le contenu signé est identique, y compris l'absence du
champ lorsque sa valeur est fausse. La fonction revient de complexité 18 à son
score antérieur 17 ; le helper a une complexité de 2. Les anciennes fonctions de
collecte et de validation des reçus, de scores 13 et 14, restent inchangées.

La vérification SQLite/Python `test_local_code_review_snapshot.js` passe.
`test_local_code_test_execution_receipts.js` valide l'exécution et la collecte du
reçu, puis échoue à son assertion homeostasis ligne 77 (`false !== true`). Le même
échec est reproduit avec le module antérieur au refactor ; il reste signalé et
n'est pas corrigé dans cette extraction équivalente.

## Dispatch code ou revue seule

Les deux points d'entrée publics `executeProposal` et `proposalResponseFormat`
gardent leurs signatures et délèguent la branche de revue seule avant d'appeler
leurs helpers de code. Les corps de code et de schéma sont conservés à
l'identique. Leurs scores reviennent de 17 à 16 et de 12 à 11, les scores
antérieurs aux branches de revue. Leurs nouveaux dispatchs restent sous 10 ; la
fonction historique de score 25 est inchangée.

Régressions concrètes : `test_local_code_worker.js`, `test_local_code_review.js`,
`test_local_code_proposal_schema_parity.js` et `test_local_code_python_cache.js`.
