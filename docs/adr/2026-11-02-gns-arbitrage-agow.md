# Raccorder GNS à l'arbitrage AGOW

## Décision

Lorsque `GENOS_NERVOUS_ENABLED=1`, chaque cycle AGOW relit l'état GNS de
l'agent dans le scope de son workspace enregistré. Une alerte fraîche ou une
pression mesurée d'au moins 0,8 produit un candidat interoceptif dans la
compétition habituelle. La pression et l'urgence sont ainsi visibles avant
la sélection, sans modifier les candidats déjà présents.

Le candidat cite le signal et l'événement de télémétrie source. Son état
épistémique demeure `UNVERIFIED`, sa confiance causale est nulle, et sa
contrainte de viabilité demande une revue. Il ne suspend aucun worker,
ne fournit aucune autorisation et suit les mécanismes AGOW existants.

L'absence de scope, un stockage indisponible ou un état expiré n'ajoute aucun
candidat. Un événement d'un autre tenant ou agent ne participe pas au cycle.
Le raccordement n'affirme aucune amélioration mesurée de qualité des décisions.

L'accès commun `nervous/consumerContext` relit le sidecar de la connexion source,
sans accepter de snapshot fourni par le demandeur. Les agents sont filtrés en SQL
et limités à 128 ; l'historique canonique est limité à 100 observations par défaut
(1 000 au maximum). Chaque entrée conserve le signal minimal et son reçu traité.
Une donnée expirée reste dans l'historique mais ne devient pas une source courante.
Le port ne transforme aucun reçu GNS en preuve métier ni en autorisation.

## Vérification

`backend/tests/nervous/gnsAgow.test.js` exécute le cycle réel, sa persistance
AGOW et l'état GNS sur SQLite. Les contrôles couvrent sélection sous alerte,
expiration, désactivation, isolation et absence de preuve de succès ajoutée.
`consumerContext.test.js` exerce également le driver `sqlite3` de production,
le sidecar sur fichier, le filtrage avant limite et la confidentialité des champs.
