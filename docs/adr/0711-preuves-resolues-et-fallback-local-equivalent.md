# ADR 0711 — Preuves résolues et fallback local équivalent

- **Statut** : Accepté
- **Date** : 2026-10-21
- **Domaine** : orchestration, preuves, worker local, Windows
- **Décideurs** : équipe GenOS
- **Lié à** : campagne `genos-reflection-comparison-pilot-v1`

## Contexte

Le worker local imposait des références de preuve non vides sans lui fournir de
registre de références autorisées. Une chaîne arbitraire pouvait donc satisfaire
le contrat de forme. Sur Windows, le fallback réduisait en outre l'orchestration
à un appel de modèle sans propager correctement les autorisations, le modèle
demandé, le mode code worker ou le dossier de preuve terminal.

## Décision

1. Toute inférence locale reçoit un registre explicite de références ; les
   références hors registre invalident l'artefact.
2. Le schéma autorise une sortie `unresolved` sans affirmation ni travail déclaré
   comme terminé lorsque les preuves disponibles sont insuffisantes.
3. Une sortie locale validée publie un événement `EVIDENCE_REPORT` distinct du
   statut terminal de l'agent.
4. Le fallback Windows propage les paramètres publics dans leurs deux écritures,
   respecte le modèle demandé et active le code worker uniquement sur demande
   explicite.
5. Le code worker reçoit un snapshot borné du workspace et ne peut exécuter que
   les commandes de la liste propre à la mission.
6. Les benchmarks doivent fournir un contrat de clôture machine, mesurer les
   jetons même lors d'un rejet et compter le respect du budget dans le succès.

## Conséquences

### Positives

- Une preuve inventée ne peut plus être admise par sa seule présence textuelle.
- L'abstention devient une sortie valide et préférable à une fausse réussite.
- Les exécutions Windows et non-Windows partagent les mêmes autorisations
  déclarées et la même identité de modèle.
- Les reçus de campagne distinguent contenu, clôture, consommation et budget.

### Négatives

- Les appelants doivent déclarer les références accessibles et le contrat de
  clôture ; les anciennes missions implicites peuvent désormais échouer fermé.
- Le fallback Windows reste un worker local unique : il ne doit pas être présenté
  comme une exécution multi-branche tant qu'une topologie équivalente n'existe pas.

## Alternatives

- Accepter toute chaîne comme preuve : rejeté, car non résoluble et falsifiable.
- Corriger uniquement les prompts : rejeté, car un modèle peut toujours inventer
  une chaîne conforme.
- Désactiver la porte finale : rejeté, car cela transformerait une erreur locale
  en fausse promotion.
