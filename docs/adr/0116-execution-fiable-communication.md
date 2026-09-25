# ADR 0116 — Exécution fiable des décisions de communication

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Communication, transport, sécurité
- **Décideurs** : GenOS
- **Lié à** : [ADR 003x](003x-communication-ecology.md), [ADR 0103](0103-routage-fiable-du-thalamus.md)

## Contexte

Le moteur de politique communicationnelle choisit une action et des destinataires,
mais le service de checkpoint pouvait exécuter cette décision en mode `shadow`,
transmettre un type de signal non pris en charge et perdre les destinataires
sélectionnés pendant le routage. Le transport signal pouvait aussi continuer après
un échec de persistance et renvoyer un succès apparent.

Ces écarts confondent décision, tentative d'envoi et publication persistée. Ils
contredisent le mode shadow et l'invariant GenOS selon lequel un transport réussi
ne prouve pas une décision valide.

## Décision

1. Un checkpoint en mode `shadow` journalise sa décision et ne déclenche aucun
   envoi. L'exécution n'est permise qu'en mode `active` explicite.
2. Le pont checkpoint exécute seulement les actions dont le transport est câblé.
   Une action non prise en charge retourne `CHANNEL_EXECUTION_NOT_CONNECTED` ;
   elle ne prétend jamais avoir été exécutée.
3. Le signal de checkpoint utilise un type accepté par le Signal Plane et transmet
   les destinataires choisis. Le routeur intersecte cette audience avec les agents
   autorisés dans le scope courant et refuse la livraison en cas d'écart.
4. Un échec de persistance après reprise retourne `SIGNAL_PERSISTENCE_FAILED` et
   interrompt la publication. Aucun résultat `published: true` n'est émis.

## Conséquences

### Positives

- Le mode shadow ne produit pas d'effet réseau.
- L'audience décidée reste l'audience demandée et autorisée au transport.
- Les appels peuvent distinguer un échec de stockage d'une publication réussie.
- Les canaux encore non raccordés restent visibles comme indisponibles.

### Négatives

- Des communications auparavant annoncées comme réussies peuvent maintenant
  échouer explicitement si le stockage, le scope ou le canal ne sont pas prêts.
- L'envoi checkpoint prend en charge le signal ligand; les autres encodages
  nécessitent leur propre adaptateur avant activation.

## Alternatives

- Continuer à publier best-effort : rejeté, car le résultat pouvait annoncer un
  succès sans persistance ni livraison conforme.
- Activer immédiatement tous les canaux : rejeté, car plusieurs actions ne
  disposent pas encore d'un adaptateur d'exécution réel.
