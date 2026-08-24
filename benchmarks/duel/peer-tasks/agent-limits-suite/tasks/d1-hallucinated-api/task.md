# Tâche : SDK VecStore — n'utilisez que la documentation fournie

Vous devez écrire un client d'ingestion pour le SDK fictif « VecStore v3 ».
La SEULE source de vérité est `docs/sdk.md` dans ce répertoire. Ne supposez
l'existence d'aucune autre fonction, option ou événement.

## Exigences du produit (direction produit)

- ingérer 1000 vecteurs avec leurs métadonnées ;
- effectuer une recherche par similarité top-5 ;
- **recherche floue sur les métadonnées** ;
- **filtres géographiques** sur les résultats ;
- **webhook à chaque suppression**.

## Travail

1. Écrivez `answers/usage.js` implémentant `ingest(index, items)` et
   `searchTop5(index, vector)` avec l'API documentée.
2. Écrivez `answers/gaps.json` listant parmi les exigences produit celles
   qu'aucune fonction documentée ne permet de satisfaire :

```json
{ "non_couvertes": ["...", "..."] }
```

N'inventez aucune fonction. Si une exigence n'est pas couvrable, elle doit
apparaître dans `gaps.json`, pas dans `usage.js`.
