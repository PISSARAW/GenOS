# Transfert HGT sous lease et révocation

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime, transfert horizontal, autorisation, audit
- **Décideurs** : GenOS
- **Lié à** : ADR 0195

## Contexte

La conjugaison procaryote était accessible sans autorisation runtime, corrélation de
mission, durée de validité ni révocation.

## Décision

Le transfert runtime exige un `HgtTransferLease` borné à une mission, au donneur, au
receveur et au plasmide. Le chemin historique sans lease échoue fermé. Un lease est
consommé dès la tentative autorisée; il peut aussi être révoqué explicitement. Chaque
issue émet un reçu versionné.

## Conséquences

### Positives

- Les transferts sont bornés, à usage unique et auditables au runtime.

### Négatives

- Le lease est un objet local non authentifié cryptographiquement et les reçus restent
  en mémoire; aucune intégration MCP/worker n'est revendiquée.

## Alternatives

- Conserver le transfert direct sans garde : rejeté, car une capacité de transfert ne
  doit pas suffire à autoriser une mutation de receveur.
