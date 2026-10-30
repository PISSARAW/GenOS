# Autorité du worker local avant les effets

Le worker local vérifie l'enveloppe d'autorité de son run avant de traiter une
proposition de code. Si l'enveloppe a expiré, si son contexte a changé ou si la
vérification échoue, le refus doit remonter au chemin d'échec du worker. Aucun
patch ne doit être écrit et aucun test de proposition ne doit être lancé après
ce refus.

```text
proposition du worker
        |
        v
vérifier l'autorité du run ---- refus ---> arrêter l'étape de preuve
        |
     autorisé
        |
        v
appliquer la proposition et exécuter ses tests autorisés
```

Le test `backend/tests/test_worker_evidence_authority_gate.js` vérifie que le
refus est propagé. La frontière d'application conserve ses propres contrôles de
chemin, de capsule et de commandes autorisées.
