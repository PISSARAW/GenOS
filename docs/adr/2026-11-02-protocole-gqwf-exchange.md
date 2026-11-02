# ADR — Protocole GQWF Exchange v1

- **Statut** : Accepté pour le profil expérimental local
- **Date** : 2026-11-02
- **Domaine** : Mondes contrefactuels, CAS, qualification et promotion
- **Références** : [Contrat](../03-reference/protocole-gqwf-exchange.md),
  [Qualification](../03-reference/gqwf-exchange-qualification.md),
  [Runtime GQWF existant](../03-reference/runtime-gqwf.md)

## Contexte

GQWF possède déjà des racines de fichiers adressées par contenu, une réplication
CAS et des closures d'exécution. Copier des objets ne prouve ni la
reproductibilité de l'environnement, ni l'applicabilité d'un résultat à la
base actuelle, ni le droit de promouvoir une branche.

Le builder de closure normalise les champs `protocol` et `assurance`. L'utiliser
seul pour inspecter une entrée non fiable pourrait masquer une assurance
mensongère en la remplaçant silencieusement par une valeur correcte.

## Décision

Introduire `genos.gqwf.exchange/v1`, avec une enveloppe commune, un descripteur
complet du monde et une conversation distincte de promotion. Réutiliser les
vrais manifests, closures et empreintes natifs, sans reproduire leur algorithme
par un hash JSON différent.

Le validateur de qualification compare le descripteur original au résultat des
builders natifs, puis vérifie les sérialisations et empreintes exactes. Une
divergence est refusée ; elle n'est pas corrigée dans le message reçu.

L'origine `observed`, `isolated`, `simulated` ou `unexecuted` reste explicite et
liée au digest du monde. Une qualification ou une promotion ne change pas cette
origine. Les assurances de closure demeurent `content-addressed`,
`declared-only` et `not-attested` pour les dimensions correspondantes.

Un candidat lie le monde, la racine, la closure, la base, la génération du head,
le prédicat exact, l'environnement, les références de preuves et la politique.
La commande du prédicat est un objet `executable`/`arguments`, comparé à la
closure ; elle n'est jamais reconstruite comme une commande shell à exécuter.

Séparer trois décisions : transférer des objets, accepter un résultat sous
politique et autoriser la publication sur une ressource. La publication doit
utiliser une base et une génération courantes, avec des preuves fraîchement
applicables et une autorité vérifiée au point de commit.

## Conséquences

- Les empreintes SHA-256 natives brutes restent distinctes des digests préfixés
  de l'enveloppe et des engagements de protocole.
- Une simulation n'acquiert pas le statut d'observation par copie ou promotion.
- La déclaration des entrées externes ne constitue pas leur attestation.
- La réception d'une commande distante ne donne pas le droit de l'exécuter.
- Une preuve devenue inapplicable à une nouvelle base nécessite une nouvelle
  décision, sans effacer l'ancien candidat ou son historique.
- Le profil initial limite chaque transfert de blob à 8 Mio et ne transporte
  pas de chemin absolu distant comme destination locale.
- Le nouveau contrat n'ajoute pas automatiquement une fédération réseau de
  production ni une implémentation Rust de la conversation.

## Alternatives

- Qualifier un monde en normalisant silencieusement ses assurances : rejeté.
- Confondre la réplication d'un fichier et la promotion d'une conclusion : rejeté.
- Accepter une ancienne preuve parce que les octets du candidat sont inchangés :
  rejeté, car la base et l'environnement peuvent avoir changé.
- Exécuter une chaîne shell reçue dans un descripteur : rejeté ; l'intégration
  choisit un vérificateur local installé et autorisé.
