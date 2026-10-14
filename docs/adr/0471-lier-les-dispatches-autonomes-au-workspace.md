# ADR 0471 — Lier les dispatches autonomes au workspace déclaré

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Identité tenant des dispatches d’orchestration directs.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0364, autorité budgétaire des dispatches Trinity ; ADR 0470, budgets d’inférence locale.

## Contexte

Le chemin direct `dispatch_trinity` pouvait recevoir `workspaceId`, mais son
`parentEnsurer` ne liait pas le parent à cet espace. Le budget parent était
persisté sans tenant, puis les workers isolés héritaient d’un scope incomplet.
Ils étaient refusés lors de l’attachement à la mission. Le chemin d’orchestration
qui passe par `prepareMission` effectuait déjà ce rattachement et validait le
tenant et le chemin.

## Décision

Extraire la validation et le rattachement existants dans un service partagé.
Quand un dispatch direct déclare un `workspaceId`, le parent doit être lié à
cet espace avant l’enregistrement du contrat, la création du scope modèle et
la préparation des capsules. Le service exige le scope tenant complet, vérifie
que le chemin déclaré correspond à celui de l’espace et refuse toute mutation
du rattachement d’un parent déjà lié ailleurs.

## Conséquences

### Positives

- Les scopes modèle et workspaces isolés des workers héritent de l’identité
  tenant déclarée.
- Un chemin absent ou incohérent échoue avant la création des workers.
- Les dispatches biologiques, Trinity et d’équipe peuvent réutiliser la même
  validation.

### Négatives

- Les dispatches directs qui transmettaient un `workspaceId` sans tenant complet
  ou avec un chemin différent sont désormais refusés avant le lancement.
- Une requête sans `workspaceId` garde le comportement précédent et ne reçoit
  pas implicitement un tenant.

## Alternatives

- Créer le scope budgétaire avec des identifiants tenant absents : rejeté, car
  cela ne permet pas d’autoriser l’attachement des workers au tenant réel.
- Insérer manuellement des lignes workspace avant le dispatch : rejeté, car
  cela contournerait la validation de chemin et de scope déjà utilisée par
  `prepareMission`.

## Vérification attendue

Exécuter un dispatch direct avec un workspace à tenant complet et confirmer que
le parent, le scope budget et les trois workspaces workers partagent ce tenant.
Un chemin incompatible doit échouer avant la création des workers.
