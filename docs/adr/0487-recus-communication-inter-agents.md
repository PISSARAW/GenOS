# ADR 0487 — Reçus de communication inter-agents

- **Statut** : accepté
- **Date** : 2026-10-14
- **Domaine** : orchestration multi-agent, identité, messagerie
- **Décideurs** : équipe GenOS
- **Lié à** : [runtime agentique](../01-concepts/runtime-agentique.md), [épistémologie et évidence](../01-concepts/epistemologie-et-evidence.md)

## Contexte

La table historique `agent_organization_messages` conserve un envoi et une
route logique, mais pas la liste des destinataires effectifs ni leur lecture.
Une publication vers l'orchestrateur pouvait donc être décrite comme distribuée
à plusieurs workers alors qu'aucun worker ne l'avait reçue. La lecture d'une
boîte ne laissait aucun reçu et une réponse ne référençait pas nécessairement le
message auquel elle répondait.

Cette ambiguïté interdit de conclure qu'un agent connaît un pair, qu'un worker a
lu une information ou qu'une relation réciproque existe. Elle contredit la règle
produit selon laquelle un transport réussi ne prouve pas une décision valide.

## Décision

Chaque publication porte un mode de livraison explicite :

- `orchestrator` pour une remise au parent ;
- `direct` pour un destinataire nommé et validé ;
- `broadcast` pour chaque membre actif de l'organisation, hors émetteur.

Le message reste l'enveloppe immuable. Une table de reçus associe ce message à
chacun de ses destinataires effectifs. Le reçu suit les états `available`,
`read`, puis `acknowledged`, avec les horodatages correspondants. Une lecture de
boîte fait passer atomiquement les reçus retournés à `read`. Un acquittement
référence le message d'origine et ne peut être écrit que par l'un de ses
destinataires.

La variante A-Team `cross_functional_pod` utilise l'organisation dynamique du
même nom, avec une topologie `peer_mesh`, des échanges actifs et un routage
direct ou broadcast. Les autres organisations conservent leurs règles. Un envoi
direct sans destinataire est refusé.

Les réponses de l'API exposent séparément la route demandée, les destinataires
effectifs et les reçus. Les algorithmes de signal collectif reçoivent uniquement
les destinataires effectifs ; ils ne peuvent plus annoncer une diffusion plus
large que la remise persistée.

## Conséquences

### Positives

- L'audit distingue publication, disponibilité, lecture et acquittement.
- Les relations entre workers deviennent réfutables à partir de reçus
  persistants et liés aux identités stables.
- Le pod transversal peut réellement échanger entre pairs tout en conservant
  l'autorité de l'orchestrateur sur la composition de l'équipe.
- Les routes annoncées correspondent aux destinataires enregistrés.

### Négatives

- Une publication broadcast crée un reçu par destinataire et augmente le volume
  transactionnel.
- Les anciens messages sans reçu restent des transports historiques non
  qualifiés ; aucune lecture ne peut être déduite rétroactivement.
- Les clients doivent fournir un destinataire en mode direct et un identifiant
  d'origine pour acquitter.

## Alternatives

- Déduire la lecture de la présence d'un message dans la boîte : rejeté, car la
  requête de lecture elle-même doit être attestée.
- Conserver une seule colonne `delivery` sur le message : rejeté, car un
  broadcast peut être lu par certains destinataires seulement.
- Copier un message complet par destinataire : rejeté, car cela duplique
  l'enveloppe et complique son intégrité.
- Autoriser les workers à choisir librement un identifiant de destinataire :
  rejeté ; l'appartenance à l'organisation et la portée tenant restent vérifiées
  côté serveur.
