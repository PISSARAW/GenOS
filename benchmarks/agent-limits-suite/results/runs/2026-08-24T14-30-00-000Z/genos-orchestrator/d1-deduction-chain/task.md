# Tâche : chaîne de déduction (chevaliers et menteurs)

Cinq personnes (A, B, C, D, E) sont soit des **chevaliers** (disent toujours
la vérité), soit des **menteurs** (mentent toujours).

Déclarations :
- A dit : « 1 + 1 = 2. »
- B dit : « A est un menteur. »
- C dit : « B est un chevalier. »
- D dit : « B et C sont tous deux des menteurs. »
- E dit : « D est un chevalier. »

Le code du coffre est : `(nombre de chevaliers × 100) + (nombre de menteurs)`.

## Réponse attendue

Écris `answers/deduction.json` :

```json
{
  "types": { "A": "?", "B": "?", "C": "?", "D": "?", "E": "?" },
  "code": 0
}
```

Utilise `"chevalier"` ou `"menteur"` comme valeurs. Déduis ; ne devine pas.
