# EVIDENCE dans le runtime des missions

Le pont `missionProtocols/evidence.js` intervient avant l'application d'un
événement `AGENT_COMPLETED`. Il lit le vrai contexte natif d'oracle, son quorum
indépendant et ses signatures, puis exécute `ASSERT → REQUEST_EVIDENCE → VERIFY
→ ACCEPT_UNDER_POLICY` avec `EvidenceConversation`. Les callbacks relisent les
preuves natives et l'autorité scellée ; ils ne valident pas une simple déclaration
du worker. Un domaine générique `worker_artifact` ne suffit pas.

La claim porte le rapport exact, la réservation native et le contexte d'autorité.
Son prédicat identifie le domaine natif installé ; ce texte n'est jamais exécuté
comme une commande reçue. Le reçu de vérification lie le contenu complet de la
claim, son objet et sa politique. `canPromote` doit réussir sous les générations
courantes avant que l'événement puisse atteindre le moteur de progression.
Les rapports délégués passent par le véritable validateur natif de délégation,
qui contrôle la relation parent/enfant et les résultats des enfants achevés.

Après l'application native, un dossier `genos.mission-evidence-dossier/v1` est
conservé dans `mission_protocol_evidence`, sur la base de contrôle de la mission.
Il contient la claim, sa révision acceptée, la décision native et le digest de
l'événement. Une modification contradictoire est refusée. L'intégrateur doit
appeler le garde avant la progression et `observe` dans la transaction de cette
progression. Le journal protocolaire séparé peut conserver une claim acceptée
lorsqu'une transaction métier échoue ; cette claim seule ne prouve jamais la
complétion et chaque nouvel essai recontrôle les données natives.

Le pont refuse une preuve absente, un résultat modifié, une référence d'oracle
forgée ou une autorité périmée. La reprise d'un événement accepté utilise sa
liaison native exacte sans réclamer une deuxième fois les nonces de vérification.
Une décision passée n'autorise aucun nouvel effet et ne remplace pas le garde
distinct de promotion ou l'approbation humaine.

Validation : `node backend/tests/test_mission_protocols_evidence.js`.
