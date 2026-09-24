# ADR 0055 — Plan métabolique des ressources Holobionte

## Statut

Accepté — sixième tranche de fondation Holobionte.

## Contexte

La résidence d'un symbionte ne doit pas lui donner une allocation illimitée.
Les ressources doivent respecter le contrat, la disponibilité du Host et la
contribution vérifiée du résident.

## Décision

1. Accorder des ressources uniquement à un résident disposant d'un contrat
   actif.
2. Définir par ressource les niveaux basal, préféré, maximum et burst. Les
   niveaux doivent être ordonnés et le maximum ne peut dépasser le contrat.
3. Refuser une allocation si le Host ne peut pas couvrir le niveau basal ;
   réduire le niveau préféré à la disponibilité réelle.
4. Autoriser le burst dans la limite conjointe du plafond et de la disponibilité
   seulement après une contribution vérifiée d'au moins 0,75.
5. Journaliser chaque allocation et révocation comme événement de session, en
   conservant l'identifiant du bail et l'explication de l'allocation.

## Conséquences

- Les ressources allouées sont bornées, explicables et révocables.
- L'allocation disponible est fournie par le plan appelant ; la comptabilité
  globale et la pression adaptative multi-symbiontes viendront ensuite.
- L'intégrité des contributions vérifiées sera renforcée par la tranche dédiée
  à la mesure de contribution et au registre symbiotique.

## Alternatives

- Accorder systématiquement le maximum du contrat : rejeté, car cela ignore la
  disponibilité réelle du Host et le bénéfice observé.
- Accorder le burst dès l'admission : rejeté, car l'essai ne prouve pas à lui
  seul une contribution durable.
