# ADR 0512 — Appliquer le budget CPU au runtime worker Node

- **Statut** : Accepté et implémenté pour le PID du runtime Node sur Windows et Linux.
- **Date** : 2026-10-15
- **Domaine** : Supervision de worker et budgets d'exécution.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0510, plafonds de ressources du runtime; ADR 0480, preuve de rejeu liée au run.

## Contexte

Les contrats de worker publiaient `resources.maxCpuMs`, mais le runtime Node ne
l'appliquait pas. Un timer de durée murale ne limite pas la consommation CPU et
ne se déclenche pas tant que la boucle d'événements du worker reste bloquée.
L'absence d'application d'un champ de contrat donnait une garantie trompeuse.

## Décision

Propager `maxCpuMs` à `executionBudget.cpuMs`. Le processus de supervision
échantillonne le temps CPU des threads du PID runtime indépendamment de la boucle
d'événements enfant et arrête le worker lorsque le cumul observé atteint le
plafond. Un plafond nul arrête immédiatement le worker. Un plafond mal formé,
une mesure indisponible ou une plateforme non prise en charge provoque aussi un
arrêt fermé.

Windows mesure `Get-Process.TotalProcessorTime` via PowerShell; Linux additionne
`schedstat` des threads de `/proc/<pid>/task`. L'intervalle d'échantillonnage est
adapté au plafond et limité à 500 ms.

## Conséquences

### Positives

- Un worker qui exécute un calcul synchrone ne bloque pas le compteur CPU du parent.
- Le runtime ne continue pas sans limite annoncée lorsque le compteur échoue.
- Le budget effectif est conservé dans `executionBudget.cpuMs`.

### Négatives et limites

- Le contrôle est échantillonné : le dépassement inclut l'intervalle et la latence
  du compteur; ce n'est pas un quota CPU imposé par le noyau.
- Le compteur couvre les threads du PID runtime, pas les processus descendants
  détachés ou les services externes appelés par le worker.
- Le compteur Rust de `genos-worker` n'est pas raccordé à un exécuteur runtime.
- La mesure Windows lance une sonde PowerShell; sous forte concurrence, son coût
  doit être évalué et pourra justifier un compteur natif ou un Job Object.
- macOS et les autres plateformes non prises en charge échouent fermé.

## Alternatives

- Considérer `maxTimeMs` comme un substitut au temps CPU : rejeté, car un délai
  mural ne borne pas la quantité de CPU consommée.
- Conserver `maxCpuMs` dans le contrat sans compteur : rejeté, car cela présente
  une ressource non garantie comme une limite effective.
- Attendre une isolation par cgroup/Job Object avant tout enforcement : rejeté
  pour cette étape, car elle laisserait le runtime Node sans arrêt CPU alors
  qu'une frontière parent/enfant mesurable existe déjà.

## Vérification

`node backend/tests/test_worker_runtime_limits.js` vérifie le plafonnement et la
propagation de `executionBudget.cpuMs`. `node backend/tests/test_worker_cpu_budget.js`
mesure le temps CPU puis vérifie qu'un processus en boucle sans rendement est
arrêté au plafond. Le test est raccordé à la suite workers. Le gate qualité staged
sur les six fichiers source passe sans violation. La mesure de l'arbre complet
et du runtime Rust reste explicitement ouverte.
