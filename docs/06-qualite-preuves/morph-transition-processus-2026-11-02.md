# MORPH : transitions et reprise aux frontières de commit

- **Statut** : Démonstrateur exécutable, profil expérimental
- **Date** : 2026-11-02
- **Portée** : Coordinateur et deux participants Node, trois bases et magasins distincts

## Exécution

Depuis la racine :

```powershell
npm --prefix backend run test:morph-protocol
```

La campagne seule se lance avec
`node backend/tests/test_morph_protocol_process_recovery.cjs`.
Chaque cas utilise des répertoires temporaires isolés. Les processus sont
arrêtés brutalement aux frontières désignées, puis relisent leurs bases WAL.
Les fichiers de checkpoint ne sont pas régénérés lors de cette reprise.

## Plan transféré

Le snapshot source porte un Syncytium avec trois vérificateurs partageant une
origine de contexte. Le snapshot cible porte une Trinity avec ces mêmes
vérificateurs et un nouvel observateur. Les deux participants d'exécution
hébergent chacun une copie complète du snapshot ; leur identité est distincte
de celle des membres logiques. La couverture du roster relève de la politique
de confiance du démonstrateur et est vérifiée avant la préparation et le commit.

Une tâche, une obligation ouverte, un budget et un effet dont l'issue reste
inconnue passent du membre `a` au membre `b` par des transferts explicites.
Leur contenu, les exigences de preuve, les dépenses et la réserve ne changent
pas. Les droits de lecture, leurs conditions, les preuves, les incertitudes,
les questions ouvertes, les dépendances et la provenance sont conservés.

L'audience d'un message ancien reste limitée à `a`. Le nouvel observateur `d`
fait partie du snapshot cible, mais ne reçoit pas le droit de consulter ce
message. L'API testée retourne les métadonnées d'audience, pas un payload privé.

Les trois vérificateurs corrélés restent un seul groupe selon les déclarations
de provenance et les dépendances conservées. Le changement de topologie ne
satisfait pas une politique exigeant trois confirmations indépendantes. Cette
mesure d'admissibilité ne constitue ni une vérification nouvelle du candidat
ni une preuve d'indépendance statistique.

## Frontières testées

La campagne reprend après chacune des étapes suivantes :

| Frontière | État conservé à la reprise |
| --- | --- |
| `PROPOSE` | Plan exact journalisé ; pas de décision |
| `QUIESCE` | Participants gelés ; effets applicatifs refusés |
| `CHECKPOINT` | Source et preuves vérifiées dans les magasins locaux |
| `PREPARE` | Participants préparés avec reçus liés au plan et à la portée |
| `READY` | Tous les nœuds du roster fixe ont fourni un reçu vérifié |
| `COMMIT` | Décision irréversible et version cible persistées au coordinateur |
| Application partielle | Un participant à la cible, l'autre encore préparé ; récupération requise |
| `FINALIZE` | Tous les reçus d'application vérifiés et état terminal durable |

Les commandes de conversation sont rejouées exactement afin de vérifier
l'idempotence. Un `COMMIT` participant sans décision autoritative est refusé.
Une finalisation prématurée reste refusée tant qu'un participant n'a pas
confirmé son application. Après décision `COMMIT`, `ABORT` est refusé et
`RECOVERY_REQUIRED` conserve la décision au lieu de prétendre annuler l'effet.

L'application du second participant et la finalisation sont aussi lancées
simultanément, en retardant la réponse de décision dans le courtier IPC. Les
lectures de décision et de reçus ne sont pas mises derrière une mutation qui
attend ces mêmes lectures. Un premier refus de finalisation peut être repris
avec le même message après réception du reçu manquant.

Un cas supplémentaire abandonne une transition préparée avant tout commit.
Les participants vérifient la décision `ABORT` et retrouvent la source à la
version initiale, sans supprimer les engagements.

## Assertions et limites

Chaque reprise réussie aboutit à deux snapshots cibles identiques, à la
version 2. Le test vérifie les snapshots complets, les propriétaires transférés,
les anciennes audiences, le refus des commandes de version 1 et le maintien
d'un seul groupe de vérificateurs corrélés. Les autres suites couvrent les
projets distincts d'une même organisation, les commits concurrents dans une
même portée, les autorités révoquées et les reçus mal liés.

Le coordinateur conserve une seule autorité SQLite. Ce profil n'est pas un
consensus distribué et ne résout pas la perte définitive ou le clonage
malveillant de cette autorité. Les décisions sont consultées par un canal IPC
de confiance dont les routes sont bornées ; leurs empreintes ne remplacent pas
l'authentification. La campagne ne qualifie pas un réseau réel entre machines
physiques et ne tue pas SQLite au milieu d'une transaction.

L'application protégée est la transaction locale du participant. Aucun effet
externe arbitraire n'est déclaré compensé après une panne. Le protocole P0
existant, ses autorisations et son canari ne sont ni activés ni contournés.
Le moteur réel de chaque topologie reste à raccorder aux adaptateurs de ce
profil ; les labels des snapshots ne prétendent pas exécuter ce moteur.

Voir le [contrat MORPH](../03-reference/protocole-morph.md),
la [conservation](../03-reference/morph-conservation.md),
la [coordination](../03-reference/morph-coordination.md) et
les [participants](../03-reference/morph-participants.md).
