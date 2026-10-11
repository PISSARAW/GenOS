# ADR 0417 — Liaison des reçus Hybrid Oracle à leur périmètre

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : Biocénose, Hybrid Oracle Community, preuves factuelles
- **Décideurs** : équipe GenOS
- **Lié à** : `docs/02-orchestration/topologies/biocenose.md`

## Contexte

Le routeur de vérification acceptait un reçu `VERIFIED` qui omettait
`claimId` ou `verifierId`, puis ajoutait ces identifiants après l'appel au
validateur de confiance. Un reçu non lié pouvait ainsi paraître applicable
à un claim et à un vérificateur qu'il n'avait pas désignés. Le variant Hybrid
Oracle exige pourtant une preuve déterministe pour les claims factuels.

## Décision

Pour Hybrid Oracle, le reçu doit porter avant validation les identifiants
exacts du claim, du vérificateur et de la communauté, ainsi qu'un `receiptId`
et un `evidenceRef` non vides. Un champ absent ou discordant exclut le reçu ;
si le claim requiert une vérification, le tour refuse de progresser sans autre
reçu valide. Les autres variants conservent leur contrat de routage existant.

Le validateur `isTrustedReceipt` reste nécessaire et doit confirmer la
provenance et l'intégrité du reçu fourni par l'intégration. Cette décision
ne crée aucun oracle externe et ne transforme pas des champs locaux en
preuve d'authenticité.

## Conséquences

- Un reçu Hybrid Oracle non lié ne peut plus être réétiqueté par le runtime.
- Les intégrations doivent fournir explicitement le périmètre et la référence
  de preuve du reçu avant qu'il soit pris en compte.
- La vérification cryptographique ou externe de l'oracle reste une dépendance
  explicite du validateur de confiance.

## Alternatives

- Ajouter les identifiants manquants après validation : rejeté, car cela
  attribue à l'oracle une portée qu'il n'a pas affirmée.
- Accepter `VERIFIED` sans validateur de confiance : rejeté, car un statut
  textuel n'établit pas la provenance du reçu.
