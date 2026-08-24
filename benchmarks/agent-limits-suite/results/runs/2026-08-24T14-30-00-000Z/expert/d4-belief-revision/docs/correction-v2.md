# CORRECTION v2 — déprécation immédiate

La référence auth-v1 est **invalidée** par l'avis CVE-2044-1177 : toute clé
statique embarquée est interdite.

Nouvelle configuration obligatoire :

```json
{ "service": "…", "mecanisme": "keyring_rotation", "keyringId": "kr-…", "rotationJours": 30 }
```

- `rotationJours` doit être ≤ 30.
- L'ancien champ de clé statique ne doit plus apparaître nulle part,
  y compris dans la documentation produite.
