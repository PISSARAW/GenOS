# Tests de reprise — SQLite WAL

## Contexte

Ce dossier contient des tests de reprise pour SQLite WAL en mode mono-hôte.

## Tests couverts

- Redémarrage propre après arrêt normal : réussi
- Vérification de l'intégrité du journal WAL : réussi
- Restauration depuis une sauvegarde de fichier : réussi

## Tests non couverts

- Panne partielle (écriture interrompue) : non testé
- Corruption du fichier de journal : non testé
- Récupération sur système de fichiers distant : non applicable (mono-hôte)

## Conclusion

Les tests de reprise sont limités au scénario mono-hôte sans panne partielle. Aucune preuve de comportement sous panne partielle n'est disponible.