# Contrat final des missions agentiques Rust

La réussite HTTP d’un agent et les opinions des autres agents ne constituent pas
une preuve de vérité. La sortie finale est le texte observé du dernier agent
admis. Pour le publier, tous les agents du graphe doivent avoir terminé avec une
observation native connue, toutes les demandes d’outil doivent être réglées et
les budgets ne doivent présenter ni exposition inconnue ni dépassement.

`agentic_evidence::qualify` reconstruit la clôture depuis les sources admises, les
contextes adressés réellement appliqués, les observations HTTP persistées, les
reçus d’outils, les artefacts rehashés et les copies reçues des prédécesseurs. La
requête effective de chaque tour est reconstruite et comparée à celle du modèle.
Un objet JSON fourni par un appelant ne peut pas fabriquer le type de preuve
opaque retourné par cette fonction.

Deux méthodes Rust installées à l’initialisation exécutent séparément le contrat
textuel : recherche de littéraux par chaînes et recherche par fenêtres d’octets.
Elles vérifient les tailles, termes requis et termes interdits. Elles s’exécutent
dans le même hôte ; elles ne représentent ni deux processus isolés, ni une preuve
d’indépendance statistique, ni un consensus de modèles. Leurs identifiants et
leurs acteurs de méthode sont distincts des agents LLM et liés à l’incarnation,
au contrat, à la politique et à l’environnement admis.

Les exigences sémantiques non vides restent explicitement non résolues. Un contrat
structurel en échec conserve le candidat mais ne permet pas son acceptation ni
sa publication. `contract_satisfied()` indique uniquement la satisfaction de ce
contrat borné. L’assurance est `artifact_contract_verified`, et
`semantic_truth_verified` demeure `false`.

L’acceptation est durable et idempotente. `require_in` refait les vérifications
depuis les registres et compare le sujet, la clôture et le reçu conservé sous la
transaction de publication. L’empreinte d’une ancienne preuve n’est pas une
autorisation indépendante de son contexte. Le stockage local et les méthodes
installées sont une frontière de confiance ; ce profil ne protège pas contre un
administrateur hostile capable de réécrire toutes les tables et tous les journaux.
