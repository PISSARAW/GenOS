# Couverture du fixture palindrome

La campagne a observé un patch qui passait les quatre assertions initiales mais supprimait une partie de la ponctuation. Le fixture conserve les tests de casse et d'espaces, vérifie tous les signes de ponctuation ASCII et plusieurs signes Unicode, puis compare 4 681 chaînes courtes à une normalisation indépendante. Il n'exécute pas la solution à la place de Qwen : le worker doit toujours écrire et tester son propre fichier.

Le test du fixture accepte une implémentation conforme et rejette la suppression générale de ponctuation ainsi qu'une liste blanche incomplète. Ce jeu borné renforce la couverture, sans constituer une preuve de correction pour toutes les chaînes Unicode.
