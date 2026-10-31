# Consommation d'une réponse worker rejetée

Une réponse du fournisseur qui viole le schéma reste un échec
`WORKER_OUTPUT_SCHEMA_VIOLATION`. Son contenu ne devient ni rapport de preuve ni
artefact accepté. L'erreur conserve cependant le modèle et le fournisseur réels,
ainsi que les tokens mesurés lorsque le routeur atteste l'appel du fournisseur.
L'événement terminal transmet ces compteurs aux métriques du même run, même si
la génération n'a pas pu retourner normalement ou si une réparation est arrêtée.

La consommation et la validité de la décision sont deux mesures distinctes. Une
requête refusée avant l'appel du fournisseur ne reçoit aucune consommation
mesurée ; des tokens estimés ne deviennent pas une preuve d'invocation. Chaque
nouvelle tentative efface le résultat de la précédente avant sa génération pour
éviter d'attribuer ses compteurs à un refus ultérieur sans appel.

Vérification : `node backend/tests/test_worker_schema_failure_usage.js` exécute le
routeur d'une tentative et le fournisseur Ollama avec un transport HTTP simulé,
rejette réellement le JSON hors schéma et rapproche son ledger du payload
terminal et des métriques. Le cas zéro budget vérifie l'absence d'appel.
