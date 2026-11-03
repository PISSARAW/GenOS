# Outils natifs des missions LLM Rust

Le profil agentique admet explicitement un graphe d’agents, leurs outils, les noms
d’artefacts autorisés et les documents sélectionnés. Seuls les `tool_calls`
structurés de la réponse HTTP observée deviennent des demandes d’outil. Du texte
qui ressemble à une commande n’accorde aucun droit.

| Outil | Données accessibles | Effet |
| --- | --- | --- |
| `read_source({path})` | Document sélectionné dans le snapshot admis | Lecture du texte conservé, sans accès implicite au système de fichiers courant |
| `list_sources({})` | Catalogue des documents sélectionnés | Noms, empreintes et tailles |
| `write_artifact({name,text})` | Nom autorisé pour l’agent courant | Création immuable dans le CAS SQLite privé de la mission |
| `read_artifact({agent_id,name})` | Agent courant ou prédécesseur direct configuré | Lecture rehashée ; un prédécesseur est lu dans la copie CAS du destinataire |

Le chargement natif des sources refuse les chemins privés, les traversées, les
liens symboliques, points de réanalyse et fichiers à liens multiples. L’outil de
lecture ne rouvre pas un chemin arbitraire : il consulte le snapshot admis. Le
contrôle de stabilité des fichiers sources appartient aussi à l’entrée du moteur.
Il n’existe aucun outil shell ni écriture dans les fichiers du workspace dans ce
profil. Les noms d’artefacts sont bornés et appartiennent à un espace par agent.
Réutiliser un nom avec d’autres octets produit un refus, sans écrasement.

`agentic_tools::execute` relit le modèle réellement observé et ses appels dans leur
ordre natif. Avant un effet frais, il reconstruit le contexte effectif et compare
son empreinte à la requête authentifiée. Chaque appel utilise une transaction
SQLite unique pour l’intention CONTINUITY/OMEGA, l’exposition ALLOSTASIE,
l’éventuelle écriture CAS, le reçu et le règlement du coût local. Le temps mesuré
est du temps mural, pas une mesure CPU. Une erreur annule ces écritures ensemble.
Un préfixe d’appels déjà commis reste durable si un appel ultérieur est bloqué.

Une demande invalide relevant de l’outil produit un reçu `status:denied` et compte
une tentative réelle. Une corruption, une autorité périmée ou un quota insuffisant
bloquent l’exécution. Les erreurs de transport du modèle conservent leur issue
inconnue dans le registre et ne deviennent pas des demandes d’outil exécutables.

Les reçus lient mission, incarnation, agent, tour, index, appel natif, contexte,
requête, résultat et objets CAS. Leur relecture vérifie aussi le journal et le
règlement du registre. Une reprise exacte restitue le reçu d’origine, y compris
un refus, sans nouveau débit et sans recalculer l’exposition ancienne depuis le
budget restant. Les getters Rust sont des interfaces internes de confiance ; ils
ne remplacent pas une politique d’autorisation pour un futur service distant.
