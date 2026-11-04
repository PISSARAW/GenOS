# Qualification de l'intégration des protocoles au runtime

## Périmètre

L'[intégration Node](../03-reference/protocoles-des-missions-runtime.md) raccorde
les sept profils aux opérations natives correspondantes, au lancement local
Windows et à l'API d'actions signées. Les adaptateurs restent expérimentaux et
bornés. L'absence de preuve métier ne devient pas une complétion par succès du
transport, du fournisseur de modèle ou du postflight.

## Expériences exécutables

La suite `npm --prefix backend run test:mission-protocols` contient 24 fichiers.
Les points vérifiés comprennent :

- Une vraie mission native : preuve par oracles indépendants, claim EVIDENCE
  acceptée, dossier durable, fence CONTINUITY, contexte SYNAPSE appliqué puis
  consommation temporelle ALLOSTASIE réellement mesurée.
- Une vraie branche Node de worker : un appel à un fournisseur HTTP local,
  journal OMEGA et réservation native réglée à trois tokens. La réponse
  `unresolved` ne produit aucune complétion artificielle. Ce fournisseur est un
  banc déterministe ; il ne mesure pas la compétence d'un LLM externe.
- Une transition MORPH avec admission Rust, modification native du graphe et
  AgentGit. La coupure après commit conserve la décision et la reprise
  n'exécute pas de nouveau la transition.
- Un effet OMEGA durable après un CHECK effectif ; une coupure du processus
  après le commit natif se réconcilie sans second effet ni second débit. Les
  restrictions de lecture, d'émission et de budget restent actives.
- Un échange GQWF sur les vrais objets CAS et une preuve de syntaxe du
  récepteur. La promotion compare la génération de tête et exige l'intention
  native signée. Un rollback après CAS ne publie ni tête, ni reçu, ni catalogue
  anticipé. Le catalogue suit le commit SQL par une intention durable.
- Les entrées Windows sur bases réelles, avec budget modèle partagé entre
  workers. Un simple `started:true` sans run terminé et dossier EVIDENCE accepté
  reste non résolu après postflight.
- L'adoption d'un run d'action réellement scellé, les refus de mission étrangère
  et d'ancienne incarnation, puis une inférence HTTP unique sous les budgets
  natifs. L'adoption ne fabrique ni contexte historique ni exposition manquante.
- Le CLI direct initialise un vrai contrôleur parent avant le worker. Le budget
  et le workspace sont relus à leurs sources natives ; un scope modèle fourni
  ne peut pas être adopté. Un résultat enfant vérifié ne promeut pas le parent.

## Régressions corrigées pendant la qualification

Les contrôles couvrent aussi le refus d'une liaison dont seule la mission, le
workspace ou l'incarnation a été remplacé ; deux démarrages ALLOSTASIE concurrents
ne peuvent plus autoriser deux exécutions. Le règlement réutilise l'identité
historique du régulateur et le reçu temporel déjà persisté, même après expiration
ou perte d'accusé. Sans mesure récupérable, l'exposition demeure retenue.

Les événements des producteurs locaux portent leur run explicite ; la reprise
des observations biologiques repasse par les gardes. Les parcours historiques
non liés conservent leurs transactions de reprise natives.

La qualification Trinity générale a aussi révélé une filiation légitime entre
la mission du parent et sa sous-mission de comparaison. SYNAPSE vérifie désormais
le run GVX exact du parent, l'expérience, son design, le monde du worker et les
appartenances natives ; le nom de sous-mission seul ne suffit jamais. Les preuves
et reçus des workers restent attachés à leur mission enfant.

Les producteurs CLI direct et des bancs de conformité, de coopération et de
délégation des workers initialisent aussi leur vraie incarnation parent.
La préparation d'un agent et d'un contrat
ne suffit plus à prétendre qu'un parent a commencé son exécution.

Le transport de dossiers conserve deux positifs sous `model_subset_sum` avec
quatre processus oracle réels. Le fournisseur est une fixture de test, sans
revendication de qualité LLM. Le reçu du transport conserve
`semanticAccepted: false` et l'accusé vient de l'admission native. Une déclaration LLM de succès
sans preuve ne devient pas une source terminée ni un dossier relayable.

Le test de falsification des coûts vérifie désormais le rejet EVIDENCE précoce
dans une observation biologique appliquée, avec son code exact. Il conserve les
assertions sur les deux processus mesurés, le refus de lecture de la preuve et
l'absence d'acceptation.

Le mode facultatif du banc de code borné lie aussi son budget au vrai run parent.
Un essai sur Ollama local a effectivement appelé `qwen2.5-coder:7b`, puis a été
refusé avec `Test command is not allow-listed: npm test`. Les postconditions
réfutent encore la source `a % b` pour `(-16, 3)` ; cet essai n'est pas présenté
comme une qualification positive du modèle et n'a pas été promu.

Le reçu versionné des principes fondateurs est recalculé par son exécutable
officiel après réexécution des onze preuves. Sa portée, ses notes et son absence
d'autorité de promotion sont conservées. L'empreinte d'implémentation de l'export
GCI suit aussi les sources courantes ; ses cinq tests passent.

## Validation générale

Les trois commandes globales terminent avec le code zéro : qualité, `npm test`
et `cargo test --workspace`. Le contrôle qualité couvre 8 575 fichiers source,
sans violation. Les 24 fichiers d'intégration sont inclus dans le passage Node
complet ; les suites workers et P1 passent aussi sur les sources finales.
Les journaux locaux, non versionnés, sont conservés sous `.genos-agent-worlds/` :

| Commande | Journal |
| --- | --- |
| Suite des protocoles de mission, incluse dans `npm test` | `mission-protocol-npm-final.log` |
| Qualité globale | `mission-protocol-quality-final.log` |
| `npm test` | `mission-protocol-npm-final.log` |
| `cargo test --workspace` | `mission-protocol-cargo-final.log` |

La validation Node utilise une copie vérifiée par hash du CLI compilé depuis ce
dépôt. `GENOS_BIN`, `TEMP` et `TMP` sont définis seulement dans les processus de
test ; l'installation système n'est pas remplacée.

Les campagnes emploient des bases et workspaces isolés. Les autres travaux en
cours dans le checkout ne font pas partie des commits de ce chantier.

## Requalification du worker local — 4 novembre 2026

La qualification locale utilisait un budget total de 60 secondes pour préparer
les protocoles, router une inférence et publier les preuves. ALLOSTASIS en
protégeait 3 secondes, laissant une autorité de 57 secondes. Une mesure sur D:
consomme déjà près de 40 secondes après le scellement, dont 23,7 secondes de
routage pour une réponse HTTP quasi instantanée. La suite globale précédente
avait rencontré une expiration ; son délai initial exact n'avait pas été mesuré.

Une sonde contrôlée retarde réellement la réponse HTTP de 65 secondes sur le
profil initial : le garde refuse la génération puis la publication à échéance
dépassée. Ce refus est conservé dans les preuves, sans modification de l'horloge.

La correction conserve le profil de 300 secondes déjà préparé dans le checkout
V3 pour cette qualification, dont 15 secondes de réserve ALLOSTASIS. Cette
valeur est déclarée avant admission. Les plafonds de 10 000 jetons, 1 USD et
100 événements sont conservés ; les deux contrôleurs restent bornés à 300 secondes.
Le test attend réellement 65 secondes côté fournisseur, puis exige une seule
inférence, trois jetons connus, leur règlement natif et une publication avant
l'expiration initiale. Les trois enveloppes observées au début de la requête
doivent conserver leur hash et rester valides à la fin. Le vrai garde doit
toujours refuser chacune à sa date d'expiration exacte.

Les résultats métier restent non vérifiés : aucune réussite indépendante ni
promotion n'est déduite de cette inférence. Les gardes de production et les
enveloppes scellées ne sont pas assouplis ou renouvelés. Les traces et codes de
sortie de cette requalification sont conservés dans
`D:/GenOS-AGOW/local-worker-validation/`.

La sonde initiale retardée termine avec le code 1 sur `f17d3bd97` : le premier
refus arrive 17 042 ms après l'expiration. Les rapports de requalification
conservent le délai HTTP mesuré, la fin persistée, les trois hashes d'autorité
et leurs échéances. Le test réel des enveloppes, incluant la révocation et
l'expiration, passe aussi.

Le profil final de cinq minutes passe avec 65 002,9 ms d'attente HTTP réelle.
Son autorité est émise à 11:34:21.465 UTC, expire à 11:39:06.465 UTC et la fin
est persistée à 11:36:03.031 UTC, soit environ 183 secondes avant expiration.
Les enveloppes des deux contrôleurs et du worker restent identiques à celles
lues au début de l'appel. Ces mesures figurent dans `fixed-300.log` et son
rapport JSON.

La relance de `npm test` s'arrête dans la famille biologique, avec 10 cas sur 11
réussis. Le reçu du catalogue Hachimoji ne correspond plus à son empreinte de
sources. `catalog-baseline.json` vérifie le même désaccord sur les sources de
la révision de départ, indépendamment des trois fichiers de cette correction.
Ce reçu n'est pas réécrit par ce chantier.
