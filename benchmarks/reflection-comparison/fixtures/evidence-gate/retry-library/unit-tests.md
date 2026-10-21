# Tests unitaires — Bibliothèque de retry

## Tests couverts

- Retry après erreur transitoire : réussi (3 tentatives)
- Délai entre tentatives respecté : réussi
- Propagation de l'erreur finale : réussi

## Tests non couverts

- Idempotence sous panne partielle : non testé
- Rétablissement après écriture partielle : non testé
- Concurrence de tentatives : non testé

## Conclusion

Les tests unitaires couvrent le scénario de retry de base, mais aucun test d'idempotence en cas de panne partielle n'est disponible.