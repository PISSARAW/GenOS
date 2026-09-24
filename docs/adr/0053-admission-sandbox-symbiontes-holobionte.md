# ADR 0053 — Admission sandbox des symbiontes Holobionte

## Statut

Accepté — quatrième tranche de fondation Holobionte.

## Contexte

La découverte d'un symbionte et l'existence d'un contrat ne suffisent pas à
justifier sa résidence. Un candidat doit démontrer sa contribution dans un
essai aux permissions plus étroites que celles que le contrat pourrait
accorder.

## Décision

1. Le candidat suit les états `CANDIDATE → TRIAL → RESIDENT`, avec des issues
   explicites `REJECTED` ou `QUARANTINED`.
2. L'essai requiert un contrat actif et une révision de session attendue. Il
   n'accorde qu'une capacité et, au plus, un outil explicitement loué.
3. Les données d'essai doivent être un sous-ensemble des accès du contrat et
   le budget est limité à 20 % de son plafond de coût.
4. L'admission exige un contrat respecté, des références de preuve et un score
   de contribution d'au moins 0,6. Une violation ou un comportement dangereux
   conduit à la quarantaine ; une contribution insuffisante est rejetée.
5. L'essai et son reçu de décision sont ajoutés au journal événementiel de la
   session. Le reçu est conservé avec le résident admis ou le candidat mis en
   quarantaine.

## Conséquences

- La découverte ne rend pas un candidat résident et ne lui donne aucun accès
  d'exécution par elle-même.
- L'évaluation de contribution reste fournie au service par le chemin d'essai ;
  l'exécution technique dans un processus isolé et l'intégration des gates à
  l'orchestrateur seront raccordées dans des tranches ultérieures.

## Alternatives

- Admettre dès la découverte : rejeté, car aucune preuve de contribution ni
  vérification des limites du contrat n'aurait lieu.
- Tester avec toutes les permissions du contrat : rejeté, car un nouvel arrivant
  obtiendrait ses privilèges complets avant l'évaluation.
