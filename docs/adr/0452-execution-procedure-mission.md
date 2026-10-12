# ADR 0452 — Exécution de procédures promues dans une mission

## Contexte

Le contrôleur de mission pouvait classer une action `procedure`, mais son chemin
actif ne savait exécuter que les outils bornés et les modèles. Une procédure
promue possède déjà des traces, un reçu de validation et une durée de validité.
Ces preuves doivent être liées à l'action attestée et au contrat d'issue courant
avant toute réservation ou exécution.

## Décision

- Le chemin `execute_mission_action` vérifie les actions `procedure` avant le
  classement. Une procédure absente, expirée, altérée ou incompatible reçoit
  une raison explicite et ne peut être choisie.
- L'action signée indique l'identifiant de procédure, sa version, son contexte
  et son empreinte, le reçu attendu, l'exécuteur local et l'entrée. La procédure
  promue porte les obligations couvertes et l'empreinte du contrat d'issue.
- Le reçu, le contexte, l'entrée et les prérequis sont revérifiés après la
  réservation, immédiatement avant l'exécution. Aucun repli implicite vers un
  modèle n'est autorisé en cas de refus ou d'échec.
- Un exécuteur local et un validateur de résultat doivent être enregistrés par
  le processus de confiance sous le même identifiant. La validation du résultat
  ne vaut pas vérification de l'issue de mission : celle-ci reste ouverte.
- La réservation et le journal d'action existants assurent le budget et le
  refus d'une nouvelle tentative avec le même identifiant d'action.

## Conséquences

Les procédures anciennes sans obligations et empreinte de contrat ne deviennent
pas exécutables dans une mission active. Leur recompilation et promotion avec
ces métadonnées sont nécessaires. Un processus sans liaison locale d'exécution
et de validation refuse l'action. L'attestation HMAC du contrôleur protège la
définition de l'action ; elle ne transforme pas le reçu de promotion en verdict
d'issue de mission.
