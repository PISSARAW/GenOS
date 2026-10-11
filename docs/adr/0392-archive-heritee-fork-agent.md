# ADR 0392 — Archive héritée vérifiable pour un agent forké

- **Statut** : expérimental, lecture seule
- **Date** : 2026-10-10
- **Décideurs** : équipe GenOS
- **Domaine** : mémoire durable, snapshots d'organisme, filiation
- **Complète** : [ADR 0390](0390-fork-agent-depuis-snapshot-scelle.md)

## Contexte

Le snapshot d'organisme contient des épisodes, des décisions, des relations,
un modèle de soi et des traces de runtime. Le restaurateur existant cible le
**même agent** : il vérifie les propriétaires, supprime puis réinsère ses lignes,
y compris les tours de modèle et le curseur d'exécution. L'appliquer à un
enfant ferait passer des actes du parent pour ceux de l'enfant et pourrait
réanimer un contexte qui ne lui appartient pas.

## Décision

Le fork inscrit dans `agents.metadata_json.inheritedArchive` un descripteur
lié au snapshot scellé. Il porte les identités parent/snapshot, les empreintes
organisme et état persisté, une empreinte des sections sélectionnées et leurs
comptages. Les sections archivables sont `memories`,
`autobiographicalEpisodes` et `decisions`, gardées sous leurs propriétaires et
identifiants d'origine. Aucun enregistrement n'est inséré dans les tables de
mémoire ou de décision de l'enfant. Un lecteur dédié peut rouvrir le snapshot
source dans la même portée et recalculer ces preuves avant de rendre un
contenu attribué explicitement au parent.

Avant de créer l'enfant, le service exige des sections de liste valides, des
identifiants uniques et le propriétaire source pour chaque ligne exposable.
La paire organisation/projet de la ligne doit être exactement celle de la
requête ou `(null, null)` pour une ligne historique sans portée ; une paire
partielle est refusée. Ce contrôle est plus strict que le contrôle indépendant
des deux colonnes utilisé par le restaurateur same-agent. Un tour de modèle
`pending` est refusé même si les tours ne sont jamais exposés à l'enfant.

Le reçu annonce `inheritedArchiveAvailable: true`, les sections, comptages et
l'empreinte après création vérifiée. Il garde `memoryCloned: false`,
`runtimeStarted: false` et `organismRuntimeRestored: false`. L'archive n'est
injectée ni dans un prompt ni dans le runtime ; toute exploitation future
demande une politique de lecture et de preuve distincte.

## Limites et reprise

Le descripteur est durable avec l'agent enfant, mais les octets archivés
restent dans le snapshot source. Si ce snapshot est supprimé ou altéré, la
lecture doit échouer ; le descripteur seul ne reconstitue pas son contenu.
Les relations, synapses, modèle de soi, état de runtime, curseurs et tours de
modèle sont exclus. Le succès ne prouve ni mémoire vécue par l'enfant ni
continuité subjective.

Une requête idempotente pour un enfant déjà persisté vérifie le descripteur,
la filiation et le marqueur de provenance. Elle tolère l'évolution ultérieure
des fichiers enfant. Avant toute première transaction, un répertoire orphelin
issu d'une interruption doit encore correspondre exactement au snapshot
source. Les écritures d'identité, lignée et budget restent atomiques.

## Conséquences

L'enfant peut consulter des archives attribuées au parent tant que le
snapshot source reste disponible et intact. Cette opération ne lui donne
aucune mémoire propre ni état de runtime. La suppression du snapshot doit
faire échouer la lecture, sans succès silencieux.

## Alternatives écartées

Réécrire `agent_id` ou `created_by` vers l'enfant falsifierait l'auteur des
lignes. La restauration same-agent transférerait aussi les tours de modèle
et le curseur de runtime. Copier le payload sans contrôle sémantique
permettrait des propriétaires et portées étrangers.

## Vérification

`backend/tests/test_sealed_agent_fork_service.js` couvre les comptages et
l'absence de copie dans les tables enfant, le refus d'un propriétaire étranger
et d'un tour en attente malgré une empreinte recalculée, le refus d'un
snapshot altéré, la non-duplication, l'évolution normale du workspace enfant,
le refus d'un orphelin modifié et la reprise après rollback SQL.
