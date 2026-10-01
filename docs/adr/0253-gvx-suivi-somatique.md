# ADR 0253 — Suivi somatique et rollback GVX

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, adaptation somatique, rollback

## Contexte

L'orchestration d'application et de rollback ne surveillait pas encore l'effet
après mutation. Le lot 5 demande une période d'observation et une comparaison
avec une baseline appariée.

## Décision

Un adaptateur runtime livre les mesures d'une fenêtre avec heures de début et
fin, ainsi que les estimations et références vérifiables. Le moniteur les
évalue avec le profil d'enveloppe existant puis persiste la décision. Une
régression mesurée déclenche le rollback via l'autorité et l'adaptateur runtime
déjà requis. Les observations réutilisées par `observationId` ne relancent ni
la collecte ni le rollback déjà consigné.

Les fenêtres incomplètes, insuffisamment échantillonnées ou sans références
valides restent inconclusives selon l'évaluateur. Elles ne sont pas promues.
Le moniteur ne démarre aucune période lui-même et n'invente pas les mesures.

## Conséquences

- La logique fail-closed et idempotente est testable sans prétendre qu'un
  runtime concret ou un producteur de télémétrie GVX est raccordé.
- Le rollback requiert une seconde autorisation indépendante.
- L'observation à long terme et les adaptateurs de production restent à faire.

## Alternatives considérées

- Considérer la demande d'application comme preuve de bénéfice : rejeté, car
  elle ne mesure aucun effet après mutation.
- Déclencher le rollback sur une mesure manquante : rejeté, car l'absence de
  preuve est inconclusive; une régression mesurée et une politique d'autorité
  sont nécessaires pour agir.
