# ADR 0608 — Confiner l’Ontogenèse avec les Job Objects Windows

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : Ontogenèse, Windows, processus, confinement
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0238](0238-execution-et-integration-ontogenese.md), [ADR 0607](0607-reprise-exhaustive-ontogenese.md)

## Contexte

Sous Windows, `detached` ne crée pas un groupe de processus équivalent à Unix.
`taskkill /T` permet une terminaison opératoire, mais ne garantit ni l'appartenance
des descendants ni leur fin lorsque le superviseur disparaît. L'admission mémoire
de l'Ontogenèse était en outre une estimation, pas une limite du noyau.

## Décision

Le runtime Ontogenèse Windows est créé suspendu par un hôte PowerShell minimal
qui appelle l'API Win32. L'hôte :

- crée un Job Object avec `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` ;
- applique `JOB_OBJECT_LIMIT_JOB_MEMORY` à partir de `reservation_mb` ;
- crée le runner avec `CREATE_SUSPENDED`, l'assigne au job puis reprend son thread ;
- conserve le handle du job et surveille simultanément le runner et le PID du
  superviseur ;
- termine le job lorsque le superviseur disparaît et ferme le handle lorsque le
  runner se termine, ce qui supprime aussi les descendants restants.

Le PID persisté reste celui du runner, pas celui de l'hôte. Si une primitive
Win32 échoue, le dispatch échoue et le journal de reprise reçoit cet échec : il
n'existe aucun fallback vers un lancement Windows non confiné. Unix conserve son
groupe de processus détaché.

## Conséquences

### Positives

- aucun descendant ne démarre avant l'assignation au Job Object ;
- la disparition de l'hôte ou du superviseur ferme l'arbre détenu ;
- la mémoire native et celle des descendants entrent dans la même limite kernel ;
- la reprise du lot 1 observe ensuite une exécution arrêtée de façon déterministe.

### Négatives

- le lancement dépend de PowerShell, de `Add-Type` et des API Win32 disponibles ;
- une réservation trop basse provoque une terminaison par le noyau ;
- cette décision ne confine que le chemin `runtimeHarness.js`, pas tous les
  processus locaux du dépôt.

## Alternatives

- Continuer avec `taskkill /T` seul : rejeté, car réactif et sans limite mémoire.
- Assigner après un `child_process.spawn` normal : rejeté, car un descendant peut
  s'échapper avant l'assignation.
- Ajouter un module Node natif : rejeté pour ce lot afin de ne pas introduire une
  chaîne de compilation et une dépendance ABI supplémentaires.
- Retomber sur un spawn direct si l'API échoue : rejeté, car cela fabrique une
  fausse garantie de confinement.

## Validation

`node backend/tests/test_ontogenesis_windows_job_object.js`

Le test Windows lance un processus qui crée un descendant, tue le détenteur du
handle et vérifie que les deux PIDs disparaissent.
