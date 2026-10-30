# Tests Python dans une capsule de code

Le runner de propositions de code lance les tests avec `PYTHONDONTWRITEBYTECODE=1`
et `PYTEST_ADDOPTS=-p no:cacheprovider`. Les imports Python et pytest ne créent
ainsi ni `__pycache__` ni `.pytest_cache` dans les fichiers sources de la capsule.
Les commandes et chemins autorisés restent vérifiés avant exécution.

Cette configuration empêche les caches usuels de polluer le diff observé ; elle
ne garantit pas qu'un programme de test quelconque ne crée aucun autre fichier.
Le test réel `backend/tests/test_local_code_python_cache.js` exécute pytest,
importe le module corrigé et vérifie le diff ainsi que l'absence des deux caches.
