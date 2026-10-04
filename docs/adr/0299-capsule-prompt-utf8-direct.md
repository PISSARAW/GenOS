# ADR 0299 — Capsule de prompt UTF-8 directe

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Transport interprocessus, communication, coût
- **Décideurs** : GenOS
- **Lié à** : [ADR 003x](003x-communication-ecology.md), [Signal Plane](../01-concepts/signal-plane-zero-text.md)

## Contexte

`PromptCapsule.prompt_dna` est un champ Protobuf `bytes`. Le transport historique
représentait chaque octet UTF-8 par quatre lettres ASCII avant de remplir ce champ.
Cette représentation augmente la taille du contenu par quatre sans réduire le
nombre de tokens du prompt finalement lu par le modèle. Une capsule déjà émise
doit rester décodable pendant la transition.

## Décision

Les nouvelles capsules portent les octets UTF-8 directs avec `encoding = "UTF-8"`.
Le décodeur accepte aussi `UTF-8-2BIT-DNA` pour les anciennes capsules. Le nom
Protobuf `prompt_dna` reste inchangé pour préserver le numéro de champ et la
compatibilité du message ; sa sémantique dépend du champ `encoding`.
Les deux variantes refusent les octets UTF-8 invalides au décodage.

La décision porte sur les octets du transport. Elle ne prétend ni supprimer le
prompt du modèle, ni prouver une économie de tokens fournisseur.

## Conséquences

### Positives

- L'encodage courant n'ajoute plus quatre octets ASCII par octet du prompt.
- Les anciens messages restent lisibles.
- Le contrat Protobuf conserve ses numéros de champs.

### Négatives

- Les consommateurs qui ignoraient `encoding` doivent être mis à jour avant
  de lire les nouvelles capsules.
- Le nom historique `prompt_dna` décrit imparfaitement le contenu UTF-8.

## Alternatives

- Garder l'alphabet DNA : rejeté, car il augmente la charge utile sans gain
  sémantique ni compression.
- Ajouter un second champ Protobuf : reporté, car `encoding` distingue déjà
  les deux représentations et le numéro existant assure la compatibilité.
