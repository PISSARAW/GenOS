# GQWF Exchange aux frontières du runtime de mission

Le raccord `missionProtocols/gqwf.js` utilise les vraies sessions d'exécution
GQWF et leur CAS. Il ne crée pas un indicateur JSON présenté comme une
publication de fichiers.

## Activation et qualification physique

Une mission qui utilise le backend natif GQWF passe automatiquement par ce
raccord après `gqwf/missionExecution.prepareMissionWorkspace`. La politique
native de matérialisation, les décisions canary et le kill switch restent
contraignants. Le raccord ne force pas GQWF sur une mission physique ordinaire.

La préparation retrouve le workspace enregistré, son tenant, la session
native, sa base et son chemin source. `GqwfExchange` exécute réellement
`OFFER_WORLD → NEED_OBJECTS → VERIFY_WORLD` sur les objets du CAS du workspace.
Le receiver fonctionne ici sur le même CAS privé : les objets déjà présents
ne sont pas retransmis artificiellement. Un objet manquant n'est pas réputé
reçu ou régénéré sans source ; la qualification échoue.

La fermeture native de la base est inscrite dans le backend. Son origine reste
`observed`, avec les limites natives `externalInputs: declared-only` et
`sandbox: not-attested`. Le reçu de transfert atteste la disponibilité et
l'intégrité des bytes, pas le succès de la mission ni une autorisation métier.

Après exécution réussie, `finalizeMissionWorkspace` ingère le vrai workspace
matérialisé et qualifie le candidat avant de libérer le lease. Le même chemin
est utilisé pour les workers en processus via `finishInProcess`. Un état
`completed` ou `awaiting_approval` produit un candidat ; un état terminal
d'échec libère la session sans fabriquer de candidat. Un run encore en cours
ne permet pas de libérer un workspace potentiellement utilisé.

Le candidat conserve son origine `isolated`. La qualification de ses objets
ne le transforme pas en monde observé, ni en monde statistiquement indépendant.

## Preuve de receiver bornée

Le profil installé utilise une exécution réelle de Node, dans un sous-processus,
avec `--check --input-type=commonjs` sur les bytes CAS des fichiers `.js` et
`.cjs`. Il couvre au plus 128 fichiers. Le runtime Node, son binaire, le module
du vérificateur, les arguments et l'environnement réduit sont liés à la
fermeture et au prédicat du candidat.

Le profil vérifie la syntaxe CommonJS ; il n'exécute pas le programme du
candidat. Les `.mjs` et les `.js` sous un `package.json` CAS de type `module`
sont explicitement refusés avec `ESM_PROFILE_NOT_INSTALLED`. Ils ne sont pas
présentés comme une syntaxe ESM réfutée. Un profil ESM, TypeScript, des tests
fonctionnels ou une évaluation métier exigent un vérificateur installé adapté.

L'absence de profil applicable, une syntaxe réfutée, un environnement modifié
ou un blob corrompu bloquent la préparation. La preuve conservée lie le sujet
exact : candidat, base et génération, fermeture, environnement et politique.
Elle n'est pas réutilisable après changement de base sans une nouvelle offre
et une nouvelle évaluation.

## Promotion : préparation, intention signée et effet natif

`strategyPromotionGate.assertProtocolPromotion` est appelé après les gates
existants : autorité, confinement, approbation, AEIS, contrat et dossier requis.
Il exécute `OFFER_CANDIDATE → REQUEST_EVIDENCE → PREPARE_PROMOTION` et attache le
descripteur exact à `promotion.gqwfProtocol`. Cette étape ne change pas la tête.
Le contrat est comparé au contrat natif du run ; un contrat de remplacement
fourni au raccord ne peut pas supprimer ses exigences.

Le journal de promotion existant réserve ensuite une intention signée qui
inclut ce descripteur. À la frontière transactionnelle de reprise,
`commitReserved` exige cette intention, le même acteur, le candidat exact et
des preuves encore applicables. `CandidatePromotion` appelle réellement
`gqwf/roots.publishCandidate` avec CAS sur la tête `mission-runtime` du workspace
dans la **base backend principale**.

La tête, son événement, le reçu de protocole et la progression transactionnelle
du pipeline natif partagent la même connexion et la même transaction SQLite.
Une erreur après le CAS mais avant le commit extérieur annule ces écritures.
La génération courante est relue ; une ancienne préparation ne permet pas de
publier après l'avancement d'une autre branche.

La publication est une tête CAS acceptée. `externalEffectsAuthorized` reste
`false`. Les effets métier et les copies éventuelles de workspace restent
soumis à leur journal et à leurs gates natifs ; ce reçu ne prouve pas leur
application et n'autorise pas un déploiement.

Une mission préparée sur une ancienne base doit être réévaluée ou rebasée. Le
raccord ne réécrit pas silencieusement la base et ne relance pas de vieux tests
sur une proposition différente.

## Catalogue : jamais en avance sur un commit extérieur

Un checkpoint catalogue natif écrit aussi des objets et refs filesystem. Ces
écritures ne peuvent pas être annulées par un rollback SQLite extérieur.

Le raccord utilise donc l'option serveur `deferCatalogCheckpoint`. Le helper
natif la choisit aussi lorsqu'il détecte une transaction appelante active.
Il conserve alors un marqueur durable `gqwf_exchange_catalog_pending` dans la
même transaction que la tête, sans publier de ref catalogue.

Le propriétaire de la transaction appelle `flushDeferredCheckpoint` après
son commit. `promotionExecutionRecovery` le fait après le pipeline et lors
d'une reprise. Une tentative de flush dans une transaction appelante reste
différée. Le marqueur n'est effacé que si sa version est toujours celle qui a
été traitée, pour conserver une demande concurrente plus récente.

Après crash, le catalogue peut donc rester **en retard** sur la base principale
jusqu'à la reprise. Il n'est jamais publié à partir d'une tête encore non
committée par ce chemin. Les garde-fous natifs contre une ref « plus récente
que SQLite » restent actifs et ne sont pas contournés. Une ancienne copie du
catalogue, du journal de transfert ou d'un reçu n'est pas une nouvelle autorité.

Le backend ne prétend pas effectuer un rollback filesystem ou réseau général.
Les callbacks de sources et d'autorité doivent rester des lectures de confiance
ou partager la frontière de génération/transaction qu'ils contrôlent.

## Tests

`test_mission_protocols_gqwf.js` traverse les frontières natives de préparation,
de finalisation en processus et de gate. Il vérifie les blobs et fermetures
réels, le sous-processus de syntaxe, l'intention signée, le CAS backend, un
rollback après CAS sans ref catalogue avancée, le flush après commit et la
corruption d'un blob lors de la reprise.

`test_mission_protocols_gqwf_safety.js` refuse le changement d'acteur ou de
contrat, un journal modifié, une génération concurrente injectée dans la base
principale et une autorité remplacée. Ces fixtures testent une publication CAS
et une intention d'opérateur de test ; elles ne constituent pas une approbation
humaine réelle ni une preuve générale de qualité du logiciel.
