# Requalification Hachimoji, reprise OMEGA et contention Rust

## Périmètre

Cette correction part de `83def27b93e9ee9c2898e4b75ce36ea1f07f5151`.
Les travaux et les preuves locales sont conservés sur D:, sous
`D:/GenOS-AGOW/global-failures-20261104/`. Les journaux, exécutables et bases
de test restent hors Git. Le reçu canonique Hachimoji est versionné après
réussite de la procédure officielle de renouvellement.

Un transport réussi ne prouve toujours ni la validité d'une décision ni
l'autorisation de promouvoir un résultat métier.

## Hachimoji

Le reçu installé ne correspondait plus aux sources de qualification. Il faut
réexécuter `migrate-agent-dna-hachimoji.cjs renew`, qui contrôle les génomes
installés, les candidats et les six programmes de preuve avant de remplacer
le reçu. Le correctif ne consiste pas à remplacer isolément une empreinte.

Le catalogue contient 234 génomes. Ses inspections Rust/Node disposent d'un
délai externe de 600 secondes. Le programme `test_worker_genome_execution.cjs`
dispose du même délai : il contient déjà une mission native imbriquée dont
le délai externe autorisé est de 300 secondes. L'ancien délai englobant de
180 secondes pouvait interrompre cette preuve avant son propre terme.
Les quatre autres programmes conservent leur délai de 180 secondes.

Le budget d'exécution de dix secondes des appels du test génomique n'est pas
modifié. Un essai instrumenté passivement a réussi en environ 160 secondes.
Les tentatives interrompues ou refusées restent archivées, notamment un refus
de complétion d'enfant pendant une qualification concurrente à la compilation
du workspace. Elles ne produisent aucun reçu de qualification réussi.

Le reçu renouvelé conserve `authorizesPromotion: false` et
`cognitiveImprovementDemonstrated: false`. La portée reste l'équivalence
d'encodage et les contrôles réellement exécutés.

## OMEGA

Le test de reprise attend désormais au plus 120 secondes la réponse IPC d'un
processus enfant, contre 20 auparavant. Une sortie avant cette réponse est
refusée même avec le code zéro. Le nettoyage termine aussi correctement si
l'enfant est déjà sorti ou n'a pas pu être lancé.

Le test réel reste inchangé sur ses garanties : arrêt après engagement de
l'effet natif, reprise dans un nouveau processus, un seul effet durable et
un budget dépensé égal à un. La reproduction initiale échoue et ce test corrigé
réussit ; aucune répétition de l'effet n'est autorisée.

## Rust

Le journal coordonne ses écritures locales avant l'entrée en transaction
SQLite. L'attente respecte le bail courant, puis l'autorité est revalidée
avant et après la mutation. Le callback n'est pas rejoué. Les régressions
couvrent notamment une écriture sœur conservée six secondes, l'initialisation
du schéma sous contention, et un bail expirant pendant l'attente : dans ce
dernier cas, le callback de mutation n'est jamais exécuté.

La coordination est locale au processus. Elle ne remplace pas les protections
SQLite entre processus et n'autorise pas une reprise d'effet d'issue inconnue.
Voir [ADR 0795](../adr/0795-admission-des-ecritures-du-journal-rust.md).

Le serveur HTTP du test de registre attend maintenant jusqu'à l'échéance
immuable de la requête admise, au lieu d'abandonner après cinq secondes.
Deux régressions vérifient une arrivée après six secondes et le refus d'une
connexion déjà en attente lorsque la fenêtre déclarée est fermée.

Le profil de qualification hiérarchique déclare avant admission 120 secondes
par tour, 600 secondes par mission et un pool ordinaire de 570 secondes.
Les gardes de production ne sont pas assouplies. Les assertions de quatorze
appels, de 560 tokens, de parallélisme réel, de reprise sans redistribution,
de conservation des expositions inconnues et de refus de publication après
corruption sont maintenues.

## Admission clinique et fixtures Windows

La suite Node a révélé un conflit distinct : la réservation au garage marque
un worker `running` avant la création de son premier run. La persistance
clinique distingue désormais cette réservation d'un worker possédant un run
`planned` ou `running`. Un orchestrateur peut préparer son contrôle médical.
Le compare-and-swap des métadonnées est conservé.

Les régressions vérifient le refus d'une réadmission d'un worker actif, la
conservation d'une modification concurrente, et l'impossibilité de remplacer
l'admission déjà liée à un run après un nouveau scan. Une quarantaine révoque
toujours l'utilisation du record lié au run. Le test réel du worker direct
réussit avec ses délais inchangés, sans promotion du contrôle parent.

Les fixtures Windows appliquent la migration médicale réelle et reproduisent
les valeurs initiales de production : métadonnées `{}` et statut `idle`.
Elles fournissent aussi la colonne de mise à jour et la table de lignée.
L'entrée Windows vérifie le lien clinique dans l'enveloppe et le refus à
l'expiration. Le profil parent déclare 300 secondes avant admission ; les
plafonds des enfants restent de 20 secondes. Le cas à deux workers réussit.
Les pools de temps ALLOSTASIS sont propres à chaque run : l'ancienne erreur
avec le profil parent de 30 secondes ne prouve pas un dépassement cumulé.
Son message de refus d'usage sans exposition est archivé ; sa cause primaire
n'a pas été isolée. Les gardes d'exposition et de comptabilité sont inchangées.

## Validation finale

- Contrôle complet de qualité : réussi, zéro violation.
- Contrôle final des 27 sources modifiées : réussi, zéro violation.
- Index ADR : 942 fichiers, 942 entrées, zéro problème.
- Reprise OMEGA réelle : réussie.
- Workspace Rust : réussi, 1 243 tests, aucun échec ni test ignoré.
- Renouvellement officiel Hachimoji : réussi, 234 génomes et six programmes
  de preuve ; empreintes des journaux vérifiées.
- OMEGA natif et reprise après crash sur les sources finales : réussis.
- Worker direct, réservation clinique et parcours Windows simple/parallèle :
  réussis en contrôles ciblés.

La suite Node globale n'est pas verte. Les premiers échecs d'admission et de
schéma Windows ont été reproduits puis corrigés. Une relance complète a été
interrompue avec le code `1073807364` avant son résultat final. À la reprise,
la suite des protocoles échoue dans `test_mission_protocols_evidence.js` avec
`WORKER_CLINICAL_ADMISSION_EXPIRED` : le calcul natif est observé, mais le worker
ne peut pas publier sa complétion après la fenêtre clinique de 60 secondes.
Ce refus est conservé ; cette exécution n'est pas comptée comme une réussite.
Le correctif ne revendique donc pas une validation globale Node réussie.
