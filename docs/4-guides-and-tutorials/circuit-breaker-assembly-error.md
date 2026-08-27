# Tutoriel : Interception d'une Erreur d'Assemblage via le Circuit Breaker

Ce tutoriel détaille l'expérience menée pour intercepter et analyser une "Assembly Error" en utilisant les outils de diagnostic et de résilience de GenOS.

## 1. Diagnostic de l'erreur d'assemblage

Au lieu de tenter de corriger une erreur à l'aveugle, nous forçons la création d'un arbre d'hypothèses structuré pour analyser la situation.

**Commande jouée :**
```bash
genos dev diagnose "assembly fails" --hypothesis "bad config" --hypothesis "missing dep" --hypothesis "ordering bug"
```

**Explication :**
Cette commande force GenOS à générer un fichier `Hypothesis Tree JSON`. Plutôt que de deviner la cause du problème, GenOS va évaluer méthodiquement les trois hypothèses fournies ("bad config", "missing dep", "ordering bug") contre les évidences récoltées, et fournir une probabilité et des actions de remédiation pour chacune.

## 2. Activation du Circuit Breaker

Lorsqu'une branche semble s'enliser dans des erreurs répétées, il est crucial de pouvoir l'arrêter avant de consommer trop de ressources.

**Commande jouée :**
```bash
genos resilience circuit-breaker --branch-id branch_123
```

**Explication et Sortie :**
Cette commande active un "Circuit Breaker" sur la branche ciblée. Le système monitorise les tentatives et, après un nombre défini d'échecs consécutifs, coupe l'exécution.

*Logs observés après 3 échecs :*
```
[INFO] Attempt 1 on branch branch_123 failed (Assembly Error)
[INFO] Attempt 2 on branch branch_123 failed (Assembly Error)
[INFO] Attempt 3 on branch branch_123 failed (Assembly Error)
[CRITICAL] Threshold reached (3/3 failures).
[ACTION] Circuit OPEN: branch branch_123 is halted.
```
