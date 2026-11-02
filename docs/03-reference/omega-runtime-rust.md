# OMEGA dans le runtime Rust

Le profil natif `integer_sum` de `genos-orchestrator::mission_protocols` raccorde
OMEGA à l'exécution réelle de la mission. Il ne passe pas par le pont Node ni par
les outils MCP d'évaluation en mémoire. Le moteur et le CLI choisissent ce profil
explicitement ; les autres graphes et les appels de modèles ne sont pas couverts.

Le graphe installé est fermé : `READ → SELECT → CALL integer_sum → CHECK A/B →
EMIT CAS`. Les seuls identifiants sont `read`, `select`, `producer`, `verifier_a`,
`verifier_b` et `emit`. Un nom de fonction fourni par la mission ne devient pas
une capacité exécutable. Le profil ne contient pas de `INFER`, de shell, de
commande arbitraire ou d'autorisation de déploiement.

Chaque intention est liée à la mission, l'incarnation courante, l'acteur, la
politique, l'environnement, la source, la base et le contexte. Le journal SQLite
enregistre `REQUEST_EFFECT` puis `AUTHORIZE_EFFECT` avant le résultat. Cette
autorisation atteste la capacité installée ; un processus requiert aussi une
exposition ALLOSTASIE fraîche. Le moteur doit respecter les deux indicateurs
`new_dispatch_authorized` et revérifier l'incarnation avant le lancement.

`READ` conserve les octets réellement lus. `SELECT` accepte un tableau JSON de
1 à 4096 entiers compris entre -1 000 000 et 1 000 000 ; son empreinte porte sur
les valeurs décodées. Le reçu opaque d'un processus lie ces valeurs, les octets
source, le rôle, le PID, le contexte et le résultat. Un reçu fourni par la mission
ne peut pas être désérialisé en `ProcessReceipt`. Les deux contrôles indépendants
utilisent les reçus de processus réels et l'admission EVIDENCE.
La séparation porte ici sur les PID et les algorithmes de calcul. Les processus
partagent le binaire et le domaine d'entrée ; aucune indépendance statistique
générale n'en est déduite.

Une reprise exacte d'une opération terminée restitue son reçu durable. Une
intention sans reçu devient `outcome_unknown` et n'autorise aucun nouvel appel.
Une nouvelle incarnation ne réautorise ni une ancienne intention inconnue, ni
un identifiant de rôle déjà exécuté pour cette mission. Ce profil borne donc la
succession partielle par un refus ; il ne reconstruit pas une continuation avec
des preuves inventées. Une nouvelle entrée exige une nouvelle mission et une
admission explicite.

`EMIT` s'effectue seulement dans la transaction GQWF qui publie la tête CAS. La
tête, le reçu OMEGA, le reçu de publication et le statut SQL `completed` sont
committés ensemble. Un contrôle manquant ou une base périmée annule toute la
transaction. Une publication réussie ne prouve aucune action métier externe.

Les tests ciblés sont `mission_protocol_omega` dans `genos-orchestrator`. Les
tests du moteur CLI ajoutent le parcours complet avec trois processus Rust.
