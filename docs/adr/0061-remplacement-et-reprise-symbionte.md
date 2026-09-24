# ADR 0061 — Remplacement et reprise d'un symbionte

## Statut

Accepté — douzième lot du plan Holobionte.

## Contexte

La perte ou la compromission d'un symbionte résident ne doit pas changer
l'identité du Host ni supprimer les capacités qui peuvent être reprises par un
backup. La reprise doit aussi fermer les ressources accordées à l'ancien
résident.

## Décision

1. Comparer les capacités du contrat source à celles des candidats de
   remplacement et ne proposer comme prêt qu'un résident avec contrat actif
   couvrant toute la niche.
2. Signaler séparément un candidat compatible qui doit encore passer par
   l'admission ; il n'est pas utilisable comme backup tant qu'il n'est pas
   résident.
3. Faire examiner la substitution par AEIS avant tout changement d'état.
4. Révoquer l'allocation de ressources du symbionte source puis le passer en
   dormance dans la même transaction, avec le backup lié au journal.
5. Rendre la demande idempotente si la même substitution a déjà été réalisée.

## Conséquences

- La substitution conserve l'identité du Host et s'appuie sur un backup ayant
  déjà reçu son admission.
- Si aucun résident ne couvre la niche, le service expose explicitement
  l'absence de remplaçant plutôt que de promouvoir un candidat implicitement.
- La recherche externe de substituts via Rhizome, le transfert de procédures et
  la reconstruction locale restent des lots ultérieurs.

## Alternatives

- Admettre automatiquement un candidat lors d'une panne : rejeté, car cela
  contournerait l'essai sandbox.
- Conserver les ressources de l'ancien résident : rejeté, car une substitution
  laisserait un accès actif sans rôle courant.
