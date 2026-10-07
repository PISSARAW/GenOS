# ADR 0360 — Oracle code borné sur artefact scellé

## Statut

Accepté, extension partielle L02/L03/L22.

## Contexte

Les domaines natifs subset sum et fidélité mémoire relient un sujet réel à
deux processus, un budget durable et une décision vérifiée. Un rapport code
ou un test sortant avec code zéro ne constitue pas une postcondition métier.
Le candidat ne doit pas choisir le programme de vérification ni ses attendus.

## Décision

La méthode `verify_code_postconditions`, version 1, est disponible pour
`verifier_worker`. Ses trois paramètres sont `artifactPath`,
`expectedContentHash` et `contractId`. Le contrat fermé
`euclidean_modulo_v1` impose le reste euclidien pour les 264 couples entiers
`a` de −16 à 16 et `b` de 1 à 8. Ces cas sont publics, fixés côté serveur
et versionnés avec la règle et le langage ; aucun test fourni par le candidat
n'est accepté.

L'artefact est un fichier `src/**/*.gexpr` du workspace attribué au worker.
Le chargeur utilise les contrôles communs de chemin relatif et de lien
symbolique. Il borne la lecture à 4 097 octets, refuse un fichier hors de
1 à 4 096 octets et compare l'identité du fichier ouvert, sa taille et son
hash SHA-256 avec le hash attendu. Le sujet relie les octets réels, le
contrat, le run, le worker, son enveloppe d'autorité et son observation
`verification_report`. Les données sont relues après chaque oracle, lors
de la clôture et lors de l'inspection actuelle.

Le langage `genos.integer-expression/v1` accepte seulement les variables
`a`, `b`, les littéraux décimaux, les parenthèses, les opérateurs arithmétiques,
les signes unaires et `Math.abs`, `min`, `max`, `floor`, `ceil`. Il borne le
texte à 1 000 caractères, les tokens à 180 et les visites de l'arbre à 180
par cas. Les appels système, accès arbitraires aux propriétés et instructions
JavaScript ne sont pas exécutés. Le compilateur construit un arbre et
l'interpréteur fermé calcule sa valeur, sans `eval`, VM ni commande candidate.
Un programme hors langage reste `inconclusive`. Une valeur non finie ou
une postcondition fausse fournit une réfutation avec contre-exemple.

Deux processus Node frais utilisent les références distinctes
`((a % b) + b) % b` et `a - floor(a / b) * b`. Le registre sélectionne le
domaine `code_postconditions` depuis la méthode persistée. Le budget scellé
du run réserve deux exécutions et une échéance totale. Les faits de PID,
sortie et durée restent dans le journal durable, même après un refus.

Le gate commun exige deux receipts indépendants selon sa politique, deux
stratégies, les hashes du contrat et de l'artefact, les bindings actuels,
ainsi qu'une couverture complète de 264 cas dans chaque receipt. Une
signature valide ne remplace pas ces conditions. L'approbation humaine
différée et la consommation des nonces utilisent le parcours existant.
La reprise retrouve l'attestation et les coûts ; elle ne finance pas un
nouveau batch. La nouvelle implémentation entre dans le manifeste des
verifiers : une preuve historique peut devenir inutilisable actuellement
après ce changement, sans perdre sa lecture historique.

## Validation

`test_native_code_completion.js`, intégré à `test:p1-socle` et à `npm test`,
exécute une vraie délégation, deux oracles, l'assemblée AEIS, l'approbation
et sa reprise. Une relecture dans un processus frais retrouve exactement
l'attestation et ses coûts. Une modification après approbation invalide
l'assurance actuelle, tout en conservant le statut historique et les nonces.

Les contre-épreuves couvrent le code faux avec verdict d'acceptation forgé
et deux sorties zéro, le langage indisponible, la modification du fichier
après le premier processus, le mauvais tenant, les chemins adverses, les
tests candidats, le mauvais hash, le lien symbolique et le budget insuffisant.
Chaque entrée invalide possède une fixture fraîche pour ne pas confondre
refus de chemin et épuisement de la capacité de délégation.

La sonde injecte aussi une assemblée et un receipt réellement signés avec
la clé de test, mais indiquant seulement un cas couvert. La signature et
l'acceptation annoncée sont valides ; la promotion refuse
`ORACLE_RECEIPT_BINDING_MISMATCH`, conserve les deux coûts et ne consomme
aucun nonce. Aucun secret ni mécanisme d'injection de test n'entre en production.
La sonde de relecture attend l'arrêt du poll Garage avant le lancement
bloquant pour éviter de retenir un verrou SQLite dans son processus parent.

## Alternatives et limites

Exécuter les tests ou le JavaScript arbitraire du candidat aurait exigé un
confinement OS qualifié et une source externe fiable des attendus. Cette
extension choisit un contrat fini et un interpréteur fermé. Les contrôles
de chemins avant et après ouverture ne prouvent pas l'absence de toutes les
courses de renommage ou de substitution de répertoires au niveau OS.

Les deux références partagent le compilateur, l'interpréteur, Node et le
contrat. Leurs processus distincts ne prouvent pas une indépendance complète
d'implémentation ou d'environnement. Ce test exhaustif du domaine fini ne
prouve pas le comportement pour d'autres entrées, l'utilité de la solution,
la qualité d'un projet ni un gain d'IA. Il ne fournit aucun holdout privé.
Le coût local en dollars reste inconnu.

Les oracles de projets généraux, les autres langages, les campagnes
comparatives, les reprises après tous les crashes et la reproduction en
clone indépendant restent ouverts. Les 115 obligations et les six lots P1
ne sont pas clôturés.
