# ADR 0758 — Continuité et confinement des relations entre agents

- **Date** : 2026-10-30
- **Statut** : Accepté
- **Domaine** : Relations, communication et confinement
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0298, ADR 0487

## Contexte

Six défauts ont été reproduits dans les services Node : identité conservée dans
une projection anonyme, audience élargie à la sortie du silence, anciens messages
exclus de l'inbox, apprentissage hors projet, indépendance optimiste sans relation
et métadonnées relationnelles non bornées. Les modifications existantes du checkout
doivent être conservées.

## Décision

La vérification d'intégrité précède la projection anonyme. Cette projection retire
les identités d'émetteur, les représentations brutes, les enveloppes et le contexte
de politique identifiant. Le reçu indique qu'il vérifie la représentation stockée,
pas le contenu projeté. Les preuves stockées restent attribuées et inchangées.
Le contenu libre qui s'auto-identifie ne devient pas anonyme par cette projection.

L'audience d'un message est figée à sa publication dans
`agent_organization_message_audiences`, y compris pendant le silence. Une transition
rend disponibles ces mêmes destinataires ; elle ne réécrit ni l'organisation
d'origine, ni la version, ni le canal, ni l'enveloppe. Les reçus ne deviennent
`available` qu'à la livraison. Un ancien message direct sans audience enregistrée
conserve son destinataire exact ; un ancien broadcast sans historique reste en
buffer dans l'attente d'une décision explicite, sans reconstitution optimiste.
Message, audience et reçus initiaux partagent une transaction SQLite ; une version
d'organisation devenue périmée refuse la publication avant toute insertion.

L'inbox relit les messages des versions précédentes sous les contrôles actuels
d'appartenance, de périmètre exact et de reçu individuel. L'anonymisation dépend
de l'organisation du message, même après une transition.

L'apprentissage relationnel filtre organisation et projet par égalité exacte,
y compris `NULL`. Un `relationId` fourni restreint encore l'écriture. Un périmètre
omis n'est jamais un joker.

La création valide les classes explicites et celles des métadonnées, les valeurs
finies dans `[0,1]`, les compteurs et les confiances par domaine avant écriture.
Les extensions de métadonnées compatibles restent possibles. Le profil sans
relation expose une indépendance et une corrélation inconnues (`null`) et ne peut
pas satisfaire une demande d'indépendance, même avec un seuil nul.

## Conséquences

Les lecteurs voient toujours les engagements antérieurs autorisés. Les messages
différés ne recrutent pas de nouveaux destinataires et les projets n'altèrent pas
les relations des autres périmètres. Les données historiques invalides ne sont
pas réécrites automatiquement. Les presets des relations connues restent des
heuristiques ; cette correction n'étend pas le RPE à tous les transports et ne
certifie aucune indépendance statistique.

## Alternatives

- Réécrire chaque message vers la nouvelle topologie : rejeté, car cela change
  son audience et sa visibilité après autorisation.
- Supprimer les messages des anciennes versions : rejeté, car cela perd les
  handoffs et les accusés attendus.
- Corriger ou borner silencieusement les métadonnées entrantes : rejeté, car cela
  masque une entrée invalide.

## Validation

`node backend/tests/test_agent_relation_regressions.js` exerce les services réels
sur une base SQLite en mémoire. La suite est également incluse dans le profil
`relationalPhysiology` de validation backend.
