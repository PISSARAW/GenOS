# ADR 0296 — Rejeu causal sous bail et journal chaîné

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Causalité procédurale, persistance, concurrence
- **Décideurs** : GenOS
- **Lié à** : ADR 0205

## Contexte

Les expériences causales épinglent désormais leurs snapshots, bras, seeds et
environnement. Les checkpoints exigent un jeton de bail et les événements portent
une chaîne de hachages. Le rejeu existant ne transmettait pas ce jeton et écrivait
le résultat hors de cette chaîne ; un fork ne pouvait donc plus terminer puis être
relu avec vérification.

## Décision

- La migration `100-procedural-causal-experiments` ajoute les colonnes nécessaires
  aux expériences et aux forks. Le numéro `099` reste attribué aux événements de
  variants Holobionte.
- Le rejeu réclame un fork par mise à jour conditionnelle et reçoit un jeton de
  bail. Chaque checkpoint présente ce jeton et la version attendue.
- La clôture du fork et l'événement `RUN_RESULT` chaîné sont écrits dans une seule
  transaction. Une clôture tardive échoue si le bail ou la version a changé.
- Une erreur ne peut modifier que le fork encore détenu par le même jeton.
- Les seeds et le nombre maximal de runs sont déclarés avec l'expérience ; les
  forks refusent les seeds absents de cette déclaration.

## Conséquences

### Positives

- Un ancien exécuteur ne peut pas écraser le résultat du nouveau détenteur.
- Le résultat final reste vérifiable par la même chaîne que les checkpoints.
- La migration préserve les données des schémas antérieurs.

### Négatives

- Les appelants doivent déclarer les seeds et un budget de runs suffisant.
- Un rejeu qui dépasse son bail sans checkpoint doit être repris après expiration.

## Alternatives

- Enregistrer `RUN_RESULT` sans hachage : rejeté, car la lecture vérifiée le
  considérerait comme une rupture du journal.
- Accepter les checkpoints sans jeton : rejeté, car un exécuteur périmé pourrait
  modifier un fork repris ailleurs.
