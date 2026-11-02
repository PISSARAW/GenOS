# ADR — Protocole CONTINUITY v1

- **Statut** : Accepté pour le profil expérimental local
- **Date** : 2026-11-02
- **Domaine** : Identité, reconnaissance, transfert de responsabilité et autorité
- **Référence** : [Contrat CONTINUITY](../03-reference/protocole-continuity.md)

## Contexte

Une identité logique, son incarnation active, une mission, une branche et une
autorité évoluent indépendamment. Copier un checkpoint ne doit pas dupliquer
les droits ou effacer les actions déjà enregistrées. La reconnaissance d'une
continuité ne suffit pas à autoriser une action sur une ressource.

## Décision

Introduire `genos.continuity/v1` avec un contrat commun portable, distinct du
protocole EVIDENCE dont la canonicalisation JSON est réutilisée. L'enveloppe
lie l'émetteur, le destinataire, la mission, la portée, la causalité, les
générations et les références d'autorité déclarées. Son empreinte protège la
cohérence du payload ; elle n'authentifie pas l'émetteur.

Séparer les quatre conversations et décisions suivantes :

1. Décrire une identité et ses relations de continuation, fork, succession ou
   restauration, sans importer les droits de son prédécesseur.
2. Reconnaître une présentation par défi et attestation bornés, journalisés et
   vérifiés par une autorité de confiance injectée.
3. Transférer explicitement les obligations, preuves, budgets, permissions et
   effets dont l'issue reste inconnue dans un bundle scellé.
4. Appliquer une génération d'autorité au point où la ressource est modifiée,
   afin de refuser les anciennes incarnations après transfert.

Le premier contrat couvre les messages de reconnaissance et de handoff. Les
implémentations de conversation doivent conserver leur historique, dédupliquer
les reprises exactes et rejeter les conflits. Une restauration conserve les
événements intermédiaires ; une empreinte seule ne prouve pas cette conservation.

## Conséquences

- L'identité reconnue et l'autorité d'agir restent des états distincts.
- Un fork ne reçoit pas implicitement les permissions de son parent.
- Les obligations ouvertes et les effets incertains gardent un responsable.
- Les callbacks d'authentification et de vérification constituent des frontières
  de confiance explicites ; aucun certificat cryptographique n'est inventé.
- Le profil local n'annonce pas une identité portable SPIFFE, une fédération
  réseau de production ou une seconde implémentation indépendante.

## Alternatives

- Déduire les droits d'un nom d'agent ou d'une empreinte : rejeté.
- Remplacer l'histoire par un ancien checkpoint lors d'une restauration : rejeté.
- Transférer un verrou sans contrôler la génération à la ressource : rejeté,
  car l'ancienne incarnation pourrait encore produire des effets.
