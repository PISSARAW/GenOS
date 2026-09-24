# ADR 0059 — Plan mémoire Holobionte

## Statut

Accepté — dixième lot du plan Holobionte.

## Contexte

La continuité d'un Host ne doit pas dépendre d'un `memory_symbiont` qui serait
lui-même le stockage. Les épisodes, procédures, réputations, événements
immunitaires et données de lignée doivent être persistés par le Host, avec des
portées explicites et des preuves.

## Décision

1. Stocker les mémoires dans un journal versionné append-only, avec les types
   `EPISODIC`, `PROCEDURAL`, `PARTNER_REPUTATION`, `IMMUNE`, `LINEAGE` et
   `HOST_CONTINUITY`.
2. Borner la visibilité à la session, mission, workspace, projet ou au Host
   persistant. Une mémoire persistante n'est accessible qu'au même `hostId`.
3. Refuser les classes de données interdites par la constitution et exiger des
   références de preuve pour toute écriture.
4. Faire examiner les écritures par AEIS ; une décision bloquée n'est pas
   persistée.
5. Exiger une preuve de procédure vérifiée pour le type `PROCEDURAL`. Rétracter
   par ajout d'une nouvelle révision plutôt que supprimer une mémoire.

## Conséquences

- Le Host peut retrouver une mémoire persistante d'une session à l'autre sans
  fusionner leurs journaux d'événements.
- Les mémoires de mission restent invisibles aux autres missions ; les scopes
  workspace et projet suivent leurs identifiants propres.
- La qualité et le chiffrement des contenus restent délégués au stockage et aux
  gates qui fournissent les références de preuve.
- Un `memory_symbiont` éventuel devient un agent de consolidation, pas le store.

## Alternatives

- Garder la mémoire uniquement dans un agent dédié : rejeté, car la continuité
  dépendrait de sa disponibilité et de son statut.
- Partager tout le contenu entre les sessions d'un Host : rejeté, car cela
  contournerait les limites de portée et de confidentialité.
