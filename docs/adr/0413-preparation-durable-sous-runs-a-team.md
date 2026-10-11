# ADR 0413 — Préparation durable des sous-runs A-Team

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : A-Team multiteam, autorité orchestrateur, budget
- **Décideurs** : équipe GenOS
- **Lié à** : `docs/adr/0408-frontiere-preuve-multiteam-a-team.md`

## Contexte

Le programme multiteam persistait sa composition et ses budgets, sans créer
de TeamRun enfant. Le runtime A-Team sait déjà créer un TeamRun et son WorkGraph
de manière idempotente. Il manque encore un adaptateur qui lance les workers
des sous-équipes et une preuve de consommation budgétaire vérifiable.

## Décision

`createProgramSubrun` réutilise le runtime canonique pour créer un TeamRun
enfant par équipe. Il charge le programme et son parent, vérifie que l'appelant
est l'orchestrateur de la mission du parent et que celui-ci est un TeamRun
`multiteam` actif. Chaque définition enfant doit fournir un variant explicite
autre que `multiteam`, un objectif, des membres et un budget local positif.
La politique de dispatch affecte l'autorité de variante et répartit ce budget
avant persistance. Le run enfant enregistre le programme, l'équipe, le parent,
la mission et l'orchestrateur autorisé ; une réexécution idempotente refuse une
liaison différente.
Lorsqu'une identité d'orchestrateur est fournie à `advanceProgramRun`, celui-ci
prépare le sous-run avant d'appeler l'adaptateur d'exécution et exige que son
résultat conserve le même identifiant enfant. L'état `WAITING` est réessayable
avec cet identifiant stable.

Le dispatch générique et la promotion du programme conservent les refus de
l'ADR 0408. Créer un sous-run `READY` ne prouve ni son lancement, ni sa clôture,
ni son coût réel.

## Conséquences

- Les sous-runs ont une identité stable, une autorité explicite et un WorkGraph
  canonique liés à la mission par l'orchestrateur parent.
- Les budgets locaux sont affectés aux membres avant le lancement ; aucune
  preuve de consommation n'est déduite de cette allocation.
- Un futur adaptateur pourra lancer ces runs et fournir des reçus vérifiés
  avant que le programme accepte `SUCCEEDED`.

## Alternatives

- Produire uniquement des identifiants `childRunId` dans le graphe programme :
  rejeté, car aucun TeamRun durable ne serait créé.
- Promouvoir l'enfant dès sa création : rejeté, car son état `READY` n'est pas
  une preuve d'exécution ni de décision valide.
