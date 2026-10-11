# ADR 0428 — Chaîne de transferts Relay Team A-Team

## Statut

Accepté le 11 octobre 2026.

## Contexte

La politique Relay Team permettait une suite de membres, mais la précondition
du runtime exigeait exactement deux membres. Son exécution ne vérifiait que le
premier transfert. Une équipe de trois membres ne pouvait donc pas suivre le
contrat décrit par sa topologie.

## Décision

- Le contrat historique de deux membres conserve ses champs `handoff*`.
- Pour trois membres ou plus, `mission.relayHandoffs` contient un transfert
  explicite par paire adjacente, dans l'ordre et avec séquences 1 à N-1.
- Le runtime vérifie chaque accusé et son digest avant de passer au suivant.
  L'état du transfert suivant doit inclure le digest accepté du précédent dans
  `handoffState.previousHandoffDigest` ; ce champ est inclus dans le digest du
  nouveau paquet.
- Une chaîne incomplète, mal ordonnée ou rompue échoue sans résultat final
  `SUCCEEDED`.

## Limite

Le service vérifie un contrat et des accusés fournis par l'appelant. Il ne
déclenche pas de workers et ne possède pas de bail persistant entre processus.
La réussite de cette vérification ne vaut donc ni preuve d'exécution réelle ni
preuve d'exclusivité du contexte. Un adaptateur opérationnel devra persister
les transitions et appliquer un contrôle de révision pour ces garanties.
