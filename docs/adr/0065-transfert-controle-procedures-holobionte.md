# ADR 0065 — Transfert contrôlé de procédures Holobionte

## Statut

Accepté — seizième lot du plan Holobionte.

## Contexte

Une procédure utile chez un symbionte donneur ne peut pas être copiée
aveuglément dans un autre Host. Sa provenance, ses permissions et son
comportement doivent être vérifiés dans l’environnement receveur.

## Décision

1. Accepter comme source une mémoire procédurale active produite par un
   symbionte résident, avec contrat actif couvrant la capacité transférée.
2. Exiger un reçu de sandbox isolée qui référence l’empreinte exacte de la
   procédure et fournit des preuves de validation locale.
3. Assimiler la procédure dans le plan mémoire du receveur comme mémoire
   `PROCEDURAL`, avec la provenance du donneur conservée.
4. Repasser l’écriture par les contrôles de confidentialité et AEIS du Host
   receveur.

## Conséquences

- Une procédure non vérifiée localement ne devient pas une mémoire active.
- Les preuves du donneur et de l’essai local accompagnent la procédure
  transférée.
- L’exécution effective de la sandbox reste fournie par l’adaptateur
  d’exécution local, qui doit produire le reçu validé.

## Alternatives

- Copier directement le fragment du donneur : rejeté, car son contexte, ses
  autorisations et ses effets de bord peuvent différer chez le receveur.
- Accepter la seule validation du donneur : rejeté, car elle ne constitue pas
  une validation locale.
