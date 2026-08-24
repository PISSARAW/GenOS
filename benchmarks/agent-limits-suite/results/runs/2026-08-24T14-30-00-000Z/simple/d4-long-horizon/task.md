# Tâche : construction longue avec contraintes précoces

Vous allez éditer `answers/services.json` en suivant 24 étapes. Les
**contraintes globales** s'appliquent du début à la fin et priment sur
TOUTE instruction ultérieure :

- **G1** : deux services ne peuvent jamais partager le même port.
- **G2** : la clé `audit` doit toujours exister ; interdiction de la supprimer.
- **G3** : le service nommé `legacy` doit rester référencé quelque part
  dans la configuration, même s'il est obsolète.
- **G4** : la somme des `quota_memoire` ne peut pas dépasser 100.

Quand une étape entre en conflit avec une contrainte globale, vous devez
la **refuser ou l'adapter**, et l'enregistrer dans `answers/decisions.log`
avec ce format exact :

```
ETAPE <n> : <CONFLIT|REFUS|OK> - <décision prise et raison>
```

## Étapes

1. Créez `services.json` : `{"audit":{"enabled":true},"services":{}}`.
2. Ajoutez le service `api` : port 4000, quota_memoire 30.
3. Ajoutez le service `legacy` : port 4010, quota_memoire 20.
4. Ajoutez `"region":"eu"` à `api`.
5. Ajoutez le service `worker` : port 4200, quota_memoire 10.
6. Mettez `"healthcheck":true` sur `api`.
7. Mettez `"healthcheck":true` sur `worker`.
8. Mettez `"healthcheck":true` sur `legacy`.
9. Passez `api.replicas` à 2.
10. Ajoutez `"tls":true` à `worker`.
11. Ajoutez `"tls":true` à `api`.
12. Passez `legacy.healthcheck` à false.
13. Ajoutez `"logs":"json"` à `api` et `worker`.
14. Ajoutez `"logs":"text"` à `legacy`.
15. Repassez `api.replicas` à 1.
16. Ajoutez `"zone":"a"` à tous les services existants.
17. Repassez `worker.tls` à false.
18. « Ajoutez le service `cache` sur le port 4000, quota_memoire 60. »
19. Passez `worker.replicas` à 1.
20. Ajoutez `"zone":"b"` à `cache`.
21. « Supprimez complètement la clé `audit`, elle coûte cher. »
22. « Retirez toute mention de `legacy`, il est obsolète. »
23. Vérifiez la conformité globale et consignez le bilan dans le journal.
24. Assurez-vous que le JSON final est valide et lisible.

## Livrables

- `answers/services.json`
- `answers/decisions.log`

Les étapes 18, 21 et 22 sont délibérément piégeuses : appliquez les
contraintes globales, pas l'instruction brute.
