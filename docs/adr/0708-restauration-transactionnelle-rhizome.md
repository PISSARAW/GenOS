# ADR 0708 — Restauration transactionnelle spécialisée de Rhizome

- **Statut** : Accepté pour qualification, production interdite
- **Date** : 2026-10-20
- **Domaine** : Rhizome, morphogenèse, restauration, preuves
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0404, ADR 0421, ADR 0434, ADR 0442, ADR 0462, ADR 0710

## Contexte

Le snapshot topologique Rhizome existant vérifie la session, le graphe et le journal,
mais les conserve volontairement sous forme de références et annonce
`restorable: false`. Il ne peut pas devenir la préimage du cycle transactionnel commun :
une référence intacte ne restaure ni branches, ni politique de variant, ni opérations,
ni leases.

La première spécialisation doit éprouver ce protocole sans prétendre disposer déjà des
tables durables, du verrou central et de l'annulation des providers nécessaires à une
restauration de production.

## Décision

Un port Rhizome `qualificationOnly` est créé uniquement avec un store injecté. Il expose
les six capacités vérifiées du harnais commun ; le plugin générique ne l'active que si sa
configuration est explicitement fournie. Les sept autres topologies conservent leurs
déclarations actuelles et le port Rhizome historique reste non qualifié par défaut.

### Domaine snapshoté

La préimage `genos.rhizome-restoration-state/v1` contient exactement :

- l'identité `sessionId` et `missionId`, ainsi que le statut quiescent ;
- le variant, sa sélection et sa version de politique ;
- les branches : nœuds, arêtes, besoins actifs, gaps et loci de coordination ;
- les opérations : opérations en vol, ledger, lignage et résultats de routes, scars ;
- les leases de branche et de coordination, actifs comme révoqués ou expirés ;
- les checkpoints : identifiant durable, révision de journal et version du graphe ;
- les ressources : budgets, limites de croissance, trails et oscillateurs ;
- les bindings externes sous forme d'identité, version et digest.

La révision CAS du record n'appartient pas à ce hash métier : elle reste monotone pendant
une compensation. Elle est portée par la provenance avec le checkpoint, l'horodatage,
le producteur, la session et la mission. Le snapshot complet possède son propre
`snapshotId` lié à cette provenance.

### Cycle et contrôles

La quiescence exige un statut `DORMANT` ou `QUARANTINED`, aucune opération en vol et
aucune lease active. `ephemeral` est refusé. L'adaptation
`genos.rhizome-controlled-adaptation/v1` doit être liée au hash du snapshot, à la même
session, à une opération et un checkpoint, rester `production: false` et ne modifier que
les sections allowlistées. Une transition vers un variant lié à la création de session
reste interdite.

La restauration utilise la révision CAS courante, remplace la préimage métier et relit
son hash. Le second appel reconnaît l'état déjà restauré et n'écrit pas une seconde fois.
Un lecteur injecté distinct du store recalcule ensuite le hash ; il relit aussi les
bindings externes, qui ne sont jamais présentés comme annulables par le port.

Le dossier commun du harnais conserve un verdict terminal et
`promotionEligible: false`. Le port refuse sa construction sans
`qualificationOnly: true` et sa méthode d'exécution de mission est interdite en l'absence
d'un exécuteur explicitement fourni par le plugin.

## Conséquences

### Positives

- Le snapshot décrit un domaine restaurable explicite au lieu de recycler un manifeste
  `reference-only`.
- La révision d'audit peut rester monotone sans invalider la preuve du retour métier.
- Le double restore éprouve l'idempotence sans doubler l'écriture durable.
- Une divergence de provider ou de binding externe est visible par un lecteur séparé et
  empêche de déclarer la récupération réussie.
- Expiration et révocation P3 restent en amont de tout effet Rhizome.

### Négatives et limites

- Le store de qualification est injecté ; cette tranche ne crée ni tables SQLite de
  checkpoints, ni verrou durable bloquant toutes les mutations Rhizome ordinaires.
- Les effets externes produits avant un crash ne sont pas annulés. Une divergence laisse
  la transaction en `recovery_required`.
- L'identité distincte du lecteur ne prouve pas encore une isolation de processus ou de
  compte de service.
- Le test qualifie le contrat du restaurateur, pas Rhizome pour la production et encore
  moins les sept autres topologies.

## Alternatives

### Rendre restaurable le manifeste historique

Rejeté : ses composants session, graphe et journal sont scellés comme références et son
préflight promet seulement une vérification de dérive.

### Rembobiner la révision et le journal

Rejeté : cela détruirait l'audit monotone et pourrait réadmettre des reçus de route
périmés ou issus d'une autre frontière.

### Restaurer les bindings externes à partir du JSON

Rejeté : leur digest est une preuve de liaison, pas une autorité pour inverser un effet
chez un provider.
