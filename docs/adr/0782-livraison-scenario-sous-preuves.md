# ADR 0782 — Livraison des scénarios sous preuves

- Date : 2026-11-03
- Statut : accepté pour le parcours Node A-Team

## Contexte

La mission « Le Dernier Sas » acceptait un titre ou un résumé comme artefact
créatif. `screenplay` tombait dans l'évaluateur générique. Le contrat collectif
GQEL ne concernait que le terminal, choisi comme critique vérificateur. Les
champs de handoff étaient perdus dans la construction de mission directe, après
leur ajout au premier payload. Enfin, le stockage d'un artefact final ne créait
pas le fichier promis à l'utilisateur.

## Décision

Le domaine `screenplay` utilise l'évaluateur créatif. Pour un contrat collectif
de scénario, chaque producteur `creative_worker` porte le contrat GQEL et ses
routes avant formation. Le terminal doit lui aussi produire un artefact créatif.
La longueur minimale, les bornes de scènes et l'exigence de dialogues sont
explicites. Ces contrôles structurels ne remplacent pas la lecture sémantique
GQEL dans un contexte frais, avec citations exactes et reçu lié au contenu.

Un schéma explicite reste le contrat de validation après extraction de
l'enveloppe JSON du fournisseur. Une erreur de forme mesurée peut alimenter
la réparation protocolaire bornée, avec conservation de sa consommation et
du refus initial. Une troncature, une substitution de modèle ou une consommation
non mesurée ne devient pas une réparation autorisée. L'effort de raisonnement
optionnel du lecteur est conservé dans les routes scellées.

Les champs de handoff, de dépendances, de critères et d'artefact traversent le
dispatch direct, l'adaptateur et le runner différé. Le runtime vérifie aussi
localement le schéma effectif du rapport des workers concernés avant clôture.

`finalArtifactOutput: {"path":"LE_DERNIER_SAS.md"}` est un mandat explicite
d'export dans le workspace déjà lié à l'orchestrateur. Sa destination entre
dans l'empreinte de formation et ne peut changer ensuite. Seuls la clôture
collective acceptée et l'artefact final signé, relu en base, permettent l'export.
La publication utilise un fichier temporaire et un lien exclusif, refuse les
symlinks, traversées et fichiers existants différents, puis relit et hache les
octets. Une reprise identique est idempotente. Une erreur d'export échoue
explicitement : elle ne devient pas une promesse de livraison.

Une demande `morphogenesis: true` sur le dispatch A-Team exécute le planificateur
existant, valide son plan et conserve son reçu dans le run. Sa portée déclarée
est une topologie simple A-Team ; elle ne revendique ni graphe composite exécuté
ni restructuration adaptative.

## Conséquences

Le vérificateur d'artefact s'exécute sans secrets. Le plan de contrôle vérifie
donc d'abord l'authenticité HMAC du reçu GQEL, son contenu, son contrat, son
score et sa présence durable. Il signe ensuite une attestation éphémère Ed25519
liée au digest du reçu, au worker, au run et à son expiration. Seule la clé
publique est épinglée dans l'environnement minimal du processus oracle. Le
processus vérifie cette signature, puis les mêmes liaisons de contenu et de
contrat que le vérificateur normal. La clé privée et les secrets HMAC restent
hors du sandbox. La clé publique et le digest d'entrée figurent dans la trace
d'exécution. Une attestation fournie par le modèle, une autre clé, un contenu
modifié ou un reçu non persisté ne sont pas admis. Cette passerelle ne change
pas la politique générale distinguant preuve de type et preuve sémantique.

Les producteurs de scénario insuffisants consomment une réparation bornée avant
transmission ou sont refusés. La qualité est plus coûteuse que la seule validation
JSON. Les outils, leases, isolation, autorité, oracles et portes de promotion
existants restent nécessaires. Un critique seul ne constitue plus le scénario.
Le résultat artistique reste une évaluation bornée par contrat et lecteurs,
pas une garantie esthétique universelle ni une durée filmée mesurée.

## Alternatives

Abaisser les barrières ou accepter `mission` comme preuve suffisante du contenu
aurait conservé les faux positifs. Écrire le scénario hors GenOS aurait masqué
les défauts. Activer toutes les topologies simultanément aurait ajouté du coût
sans établir leur pertinence ni leur exécution réelle.
