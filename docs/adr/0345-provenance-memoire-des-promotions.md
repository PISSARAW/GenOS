# ADR 0345 — Lier la mémoire de promotion à son exécution

- **Statut** : accepté.
- **Date** : 2026-10-07.

## Contexte

La qualification des consommateurs L01/L02 révèle que la promotion écrit une
mémoire sous le nom affiché de l’agent, sans organisation ni projet. Le résumé
peut porter un marqueur de fait vérifié sans authentification de sa source.
Un hash philosophique facultatif ne décrit pas les vérifications de ce run.

## Décision

Le gate transmet à sa finalisation l’ID de l’assemblage AEIS réellement évalué.
Un service de mémoire dédié relit et vérifie son sceau, son acceptation, le run
et le scope issu du workspace en base. Il enregistre un parent de provenance
contenant run, contrat, agent, assemblage et IDs des résultats vérificateurs.
La mémoire enfant utilise l’ID stable de l’agent et le tenant de son workspace.
Les options du demandeur ne fournissent pas cette identité ni cette preuve.

Les expériences ordinaires portent `[RECORDED_EXPERIENCE]`. Les lecteurs de
résumés et du prompt remplacent un marqueur `[VERIFIED_SYSTEM_FACT]` non
authentifié. Ils conservent les observations comme données de mémoire.

## Conséquences

Les tests exécutent une promotion avec deux répliques locales puis relisent sa
mémoire dans un nouveau processus. Ils contrôlent le lien vers l’assemblage,
l’identité stable et l’exclusion du tenant étranger. Le hash de provenance est
une empreinte de contenu ; le sceau de l’assemblage est un HMAC.

La mémoire reste une écriture après finalisation, au mieux, avec télémétrie
d’échec : la promotion et son souvenir ne forment pas une transaction atomique.
Les drapeaux internes de scoring ne sont pas un protocole cryptographique
d’authentification de toutes les sources. Le filtrage du marqueur ne constitue
pas une défense générale contre les injections de prompt.

La consommation durable des nonces et ses limites restent celles de l’ADR 0343.
Cette décision n’ajoute pas de verrou global de promotion ni de reprise des
effets externes exactement une fois.

## Alternatives

- Conserver le nom et un scope global : perd l’identité et le confinement.
- Traiter un résumé ou des booléens du demandeur comme une preuve : forgeable.
- Réutiliser seulement le hash philosophique : ne relie pas l’exécution AEIS.
- Rendre la mémoire obligatoire pour terminer une promotion : modifierait la
  sémantique de reprise ; cette qualification conserve l’écriture au mieux.
