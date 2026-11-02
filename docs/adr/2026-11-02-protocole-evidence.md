# ADR — Protocole EVIDENCE v1

- **Statut** : Accepté pour le profil expérimental local
- **Date** : 2026-11-02
- **Domaine** : Preuves, réfutation, conversations durables
- **Référence** : [Contrat EVIDENCE](../03-reference/protocole-evidence.md)

## Contexte

Les contrats de vérification et la propagation des contre-exemples existent dans
le backend. Ils ne définissent pas à eux seuls une conversation portable entre
producteurs, vérificateurs et consommateurs. Un accusé de transport ne prouve ni
la validité d'une affirmation ni l'application d'une révocation.

## Décision

Introduire un profil `genos.evidence/v1`, avec un schéma JSON commun, une
canonicalisation déterministe et une validation d'exécution stricte. Chaque
affirmation lie un artefact, sa base, son environnement, un prédicat, un domaine,
des hypothèses, des preuves, une provenance et une politique versionnée.

Les identifiants d'agent, d'incarnation, de domaine de confiance et d'autorité
restent séparés. Les générations d'incarnation, d'organisation et de workspace
ne sont jamais substituables. L'empreinte du payload détecte une divergence ;
elle n'authentifie pas l'auteur et n'accorde aucun droit.

La conversation persistante et les révisions utilisent ces messages sans
modifier les circuits d'admission existants. Toute intégration doit injecter
une vérification et une autorisation fiables, puis évaluer de nouveau la
politique applicable à l'objet courant. Les anciens consommateurs ne sont pas
considérés compatibles automatiquement.

Le profil jury engage les verdicts avant révélation et regroupe les contributions
selon les dépendances déclarées. Ces déclarations ne constituent pas une preuve
d'indépendance statistique.

## Conséquences

- Les messages et empreintes sont testables sans transport particulier.
- Les erreurs de version, forme, intégrité et expiration échouent explicitement.
- Le journal conserve l'histoire et distingue réception et application.
- La portabilité du schéma ne constitue pas une preuve d'interopérabilité avec
  une deuxième implémentation indépendante, Rust ou A2A.
- Une intégration réseau de production devra établir l'authentification, les
  autorités, la distribution des politiques et la protection des magasins.

## Alternatives

- Transporter uniquement une phrase et un score : rejeté, car le résultat perd
  son objet exact et ses conditions d'applicabilité.
- Assimiler une empreinte à une signature : rejeté, car tout émetteur peut
  calculer une empreinte.
- Promouvoir sur simple réception d'un message : rejeté, car la vérification et
  l'application d'une révision sont des opérations distinctes.
