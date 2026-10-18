# ADR 0625 — Admission bornée et révocation authentifiée

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : qualification, autorité, révocation, consommation
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0604, ADR 0613, ADR 0624

## Contexte

La phase 8 sait retirer la note effective lorsqu'un registre déclare un reçu
révoqué, mais le registre v1 ne prouve pas qui a émis cette décision. De plus,
un consommateur pouvait appeler directement le service d'évaluation sans obtenir
un bail borné à son identité et à son usage.

## Décision

Les révocations utilisent désormais une chaîne append-only. Chaque entrée porte
un numéro de séquence, le hash précédent, le hash du reçu visé, une autorité, un
motif et une date. L'autorité signe le corps canonique avec Ed25519. Le runtime
vérifie la chaîne, la clé publique active, la signature et le hash de l'entrée.
Une chaîne ou un registre de confiance invalide place la qualification en
quarantaine ; une entrée valide et courante visant le reçu produit `revoked`.

Le gate d'admission consomme l'évaluation Phase 8. Il refuse tout état autre que
`current`, exige un consommateur explicitement autorisé et émet un reçu signé
dont l'expiration est la plus petite entre le TTL demandé, le plafond de cinq
minutes et la fin de validité des preuves. Le reçu reste non promotable.

Le registre de confiance versionné est vide par défaut : aucune révocation non
signée n'est acceptée. Les clés privées demeurent hors dépôt. Un déploiement doit
ajouter une clé publique active par changement gouverné avant d'émettre une
révocation réelle.

## Conséquences

- Une chaîne falsifiée, réordonnée ou signée par une autorité inconnue échoue fermée.
- Un reçu admis ne peut pas être réutilisé par un autre consommateur.
- L'admission expire toujours avant les preuves qui la fondent.
- La signature d'admission est vérifiable contre le même registre de confiance ;
  elle n'accorde cependant aucune autorité de promotion.
- La rotation et la garde matérielle des clés privées restent hors de ce lot.

## Preuves exécutables

- `backend/tests/test_foundational_qualification_admission.js` couvre le bail,
  l'expiration, le changement de consommateur, l'altération, la révocation signée
  et la signature forgée ;
- le gate de qualification exécute ce test et lie sa sortie au reçu Phase 9.

## Alternatives écartées

- **Faire confiance au champ `authority` en clair** : identité non authentifiée.
- **Émettre un jeton seulement hashé ou sans expiration** : contenu forgeable ou
  autorité détachée de la fraîcheur.
- **Autoriser un registre invalide tant qu'il ne vise pas le reçu courant** :
  comportement fail-open.
