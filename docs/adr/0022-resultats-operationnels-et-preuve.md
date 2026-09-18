# Résultats opérationnels et preuve

- **Statut** : Accepté
- **Date** : 2026-09-18
- **Domaine** : Runtime, MCP, validation, preuves
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0019, ADR 0021

## Contexte

Plusieurs chemins retournaient `success: true` après un transport réussi, une
simulation ou un fallback. Cette convention rendait impossible de distinguer une
opération réellement terminée d'une réponse seulement structurée.

## Décision

Les résultats opérationnels utilisent désormais un statut explicite :

- `completed` : l'opération a été exécutée et son résultat est disponible ;
- `failed` : l'opération n'a pas abouti ;
- `simulated` : aucune mutation réelle n'a été effectuée ;
- `fallback` : une voie de repli a été utilisée sans constituer une preuve de
  réussite de la voie demandée.

Le champ `success` vaut `true` uniquement pour `completed`. Les champs
`simulated`, `fallbackUsed`, `evidence` et `error` doivent conserver la
qualification de l'opération. Un statut HTTP ou gRPC favorable ne constitue pas
une preuve métier.

## Conséquences

### Positives

- Les consommateurs peuvent refuser une simulation ou un fallback quand une
  preuve réelle est requise.
- Les erreurs ne sont plus transformées en valeurs métier arbitraires.
- Les audits peuvent distinguer transport, exécution et vérification.

### Négatives

- Les intégrations anciennes qui ne lisent que `success` devront être adaptées.
- Les réponses existantes peuvent changer de statut sans changement de transport.

## Alternatives

Conserver `success: true` et ajouter seulement un champ `verified` a été écarté :
cela continuerait à permettre de présenter une simulation comme une réussite.
