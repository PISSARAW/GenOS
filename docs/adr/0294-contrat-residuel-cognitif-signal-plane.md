# ADR 0294 - Contrat cognitif residuel du Signal Plane

- **Statut** : Accepte
- **Date** : 2026-10-04
- **Domaine** : Signal Plane, cognition, preuve

## Contexte

L'escalade cognitive envoyait au modele une consigne en prose et des objets de contexte
serialises sans contrat de sortie. Le registre de connaissance partagee conservait une
expiration sans la verifier lors des lectures. Une reponse du modele etait comptabilisee
comme utile alors qu'aucune action ni verification n'en decoulait.

## Decision

Le Signal Plane compile une operation `INFER` versionnee apres la porte d'escalade
existante. Le contrat indique sa source, son destinataire et les sorties permises :
`candidate`, `need` ou `unknown`. Il produit un rendu portable avec les donnees du signal
materialisees dans l'invocation. Les champs de contexte redondants sont inscrits dans un
registre d'omissions retourne hors du prompt. Un recu lie le destinataire et le hash du
prompt exact ; il ne pretend pas attester une memoire entre invocations.
Le recu, les octets exacts du rendu et la reponse sont conserves dans SQLite.
Une livraison repetee du meme signal, au meme destinataire et avec le meme rendu
reutilise la reponse terminee ; une invocation encore en cours ou echouee est bloquee.

Les signaux non autorises, incoherents, non serialisables ou trop volumineux sont
bloques avant l'appel au modele. Sa reponse reste un candidat non verifie. Le chemin
d'escalade n'enregistre plus une utilite positive sans verification independante.
Les lectures du common ground excluent desormais les entrees expirees.

Cette premiere integration ne constitue pas un ordonnanceur G-CIR general. Les autres
points d'entree des modeles, le transport binaire canonique et les adaptateurs latents
exigent des contrats et des evaluations propres avant leur branchement.

## Consequences

- Le modele recoit une projection textuelle courte et explicite ; les donnees imbriquees
  irregulieres restent serialisees en JSON, format adapte a ce cas.
- Les omissions et la visibilite sont inspectables par l'appelant sans etre affichees
  au modele et restent consultables dans le recu persiste.
- Aucun resultat neuronal ne peut declarer sa propre verification ou publication.
- Les appels excedant la limite de projection echouent explicitement, sans troncature.

## Alternatives

- Envoyer des opcodes opaques au modele : rejete, car une API textuelle ordinaire ne
  garantit pas leur comprehension.
- Deduire la visibilite du common ground : rejete, car un savoir partage ne prouve pas
  le contenu present dans une invocation precise.
