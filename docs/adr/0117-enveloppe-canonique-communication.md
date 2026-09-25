# ADR 0117 — Enveloppe canonique de communication

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Communication, contrats, interopérabilité
- **Décideurs** : GenOS
- **Lié à** : [ADR 0116](0116-execution-fiable-communication.md), [ADR 003x](003x-communication-ecology.md)

## Contexte

Les signaux non textuels et les messages d'organisation transportent des
métadonnées différentes, malgré des besoins communs : identité, audience,
portée, références sémantiques, expiration et niveau d'ancrage. Cette divergence
complique l'observabilité et les garanties de livraison.

## Décision

Adopter une enveloppe versionnée commune au Signal Plane et aux messages
d'organisation. Elle porte l'identité de communication, la modalité, le canal,
l'audience, la portée, les références, les dates, le niveau d'ancrage requis et
l'empreinte SHA-256 du payload canonique.

L'enveloppe est ajoutée de façon compatible aux payloads existants. Les anciens
champs restent lisibles; le champ `communicationEnvelope` fournit la nouvelle
représentation commune. L'empreinte détecte les divergences du contenu mais ne
prouve ni l'identité de l'émetteur ni son autorité : celles-ci restent imposées
par les leases et les routeurs existants.

## Conséquences

### Positives

- Les deux transports exposent les mêmes métadonnées corrélables.
- Les payloads sont adressables par une empreinte stable sans duplication dans
  l'enveloppe.
- Le contrat JSON et son validateur d'exécution rendent les champs versionnés
  inspectables.

### Négatives

- Les payloads augmentent légèrement en taille.
- L'enveloppe v1 n'unifie pas encore la stigmergie, les dialogues, les handoffs
  A-Team ou les accusés de grounding; leurs adaptateurs restent à raccorder.
- Les consommateurs doivent ignorer l'extension additive lorsqu'ils ne la
  comprennent pas.

## Alternatives

- Ajouter une table enveloppe parallèle et des migrations pour tous les messages :
  rejeté pour cette première étape, car cela imposerait une migration avant que
  les consommateurs sachent exploiter le contrat.
- Garder des métadonnées propres à chaque transport : rejeté, car cela conserve
  la fragmentation que l'enveloppe vise à résoudre.
