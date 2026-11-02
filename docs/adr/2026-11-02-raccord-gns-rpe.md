# Raccordement GNS aux relations RPE

- Statut : accepté
- Date : 2026-11-02

## Décision

Le pont de télémétrie GNS reconstruit les arêtes RPE avant la réduction d'une
observation persistée. La source est `agent_relations`, sans lire de graphe proposé
dans le payload. Les identités des deux extrémités sont vérifiées dans leurs
workspaces du même tenant. Seuls les types connus du catalogue RPE, actifs et
dans leur intervalle de validité, sont retenus. Les arêtes gardent leur direction.

Une mission déclarée doit contenir l'émetteur dans `mission_agents` ; elle borne
aussi les destinataires. Sans mission explicite, un rattachement unique est
recherché dans cette même table ; l'absence ou l'ambiguïté interdit la projection.
Les données absentes ne créent aucune relation.
La configuration est relue pour chaque événement, donc une révocation n'exige
pas de redémarrage. Les plafonds GNS restent applicables sans troncature silencieuse.

Le graphe est scellé avec le signal durable par le runtime GNS. Une ancienne
observation ne devient pas une alerte fraîche lors d'un rattrapage.

## Frontière d'autorité

Le raccordement produit seulement des propositions locales `INCREASE_MONITORING`
liées aux reçus GNS. Il n'envoie pas de contenu à un agent, n'accorde aucune
permission RPE et ne contourne ni les grants de communication ni les gates d'effet.
Le statut épistémique demeure `UNVERIFIED`.

## Vérification

`node --test backend/tests/nervous/gnsRpe.test.js` exerce une base SQLite réelle,
le pont de télémétrie, les propositions de surveillance, les relations révoquées
et expirées, les frontières de tenant/mission et la désactivation.
