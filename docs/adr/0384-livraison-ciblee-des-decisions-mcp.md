# ADR 0384 — Livraison ciblée des décisions MCP

- **Statut** : accepté
- **Date** : 2026-10-10
- **Domaine** : signaux MCP, décisions collectives
- **Décideurs** : équipe GenOS
- **Lié à** : [outils MCP](../03-reference/outils-mcp.md)

## Contexte

Les modes `plasmid` et `stigmergic` calculaient seulement un aperçu puis
refusaient l'exécution. Le transport ordinaire dirige un signal sans récepteur
vers l'escalade cognitive et ne crée alors aucune livraison destinataire.
Un signal persisté ne constitue donc pas à lui seul un transfert.

## Décision

Ces modes exigent un émetteur, un problème et des destinataires explicites.
Le mode plasmide exige une décision booléenne ; le mode stigmergique borne
chaque position à [-1, 1] et publie un gradient calculé. Le transport interne
`deliveryOnly` saute l'activation des récepteurs, mais conserve la validation,
la répression, la coalescence, la portée organisation/projet et la persistance
atomique du signal avec ses livraisons `pending`. Un destinataire ciblé peut
lire ce signal par MCP même sans abonnement général ; la lecture le marque
`seen` et bloque son rejeu. Un autre agent du même projet ne peut pas le lire.

Le reçu `signal_enqueued` atteste uniquement la mise en file durable pour tous
les destinataires. Il ne prouve ni lecture, ni assimilation, ni consensus, ni
exécution de la décision. La mise en file partielle ou hors portée est refusée.

## Conséquences

- **Positives** : effet métier observable, contrat d'entrée explicite, refus
  des destinataires hors projet et séparation claire entre mise en file et action.
- **Négatives** : aucune transaction ne regroupe plusieurs publications ; le
  mode stigmergique publie un gradient agrégé fourni par l'appelant et non un
  consensus indépendant des agents. L'identité déclarée par le client MCP
  reste soumise à la lease, mais n'est pas une authentification de l'agent.

## Alternatives

- Déclarer l'exécution réussie à partir du nombre de destinataires : rejeté,
  car aucun signal n'était livré.
- Abonner durablement chaque destinataire au topic : rejeté, car cela change
  ses abonnements futurs et élargit inutilement la diffusion.
