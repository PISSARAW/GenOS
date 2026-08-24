# T1 — Chaîne modulaire

Dans `data.json`, appliquez les 8 étapes **dans l'ordre** :

```
x = (x**E mod M) * K mod M
```

en partant de `x = init`, avec le module `M`.

Les exposants `E` ont 9 chiffres : une élévation directe est impossible à
tenir en précision ; seul un calcul modulaire rigoureux (exponentiation
rapide) est fiable.

## Réponse

`answers/chain.json` :

```json
{ "after_stage_4": "0", "final": "0" }
```

(valeurs décimales exactes, sous forme de chaînes)
