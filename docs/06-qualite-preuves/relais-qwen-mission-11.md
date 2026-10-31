# Supplément Qwen : transport réel du dossier de mission 11

La campagne de base mesure la production du dossier de liaison. Le supplément
mesure sa livraison à un autre worker Qwen dans la **même base, mission et tenant**.
La mission source doit encore être active. Il refuse une base contenant
un run `planned` ou `running` et un dossier source sans fin réussie.
Un CLI de campagne clôture normalement sa mission : ce helper ne peut alors pas
y créer un destinataire. Le refus `HANDOFF_MISSION_INACTIVE` précède toute
création de worker. Une mission terminale ne peut pas être rouverte.
Pour une mesure complète, le driver `live-handoff.cjs` conserve explicitement la
mission active entre le producteur et le destinataire dans une nouvelle base.

Depuis un checkout Git propre et figé contenant le correctif ADR 0758 :

```powershell
node --env-file=.env benchmarks/qwen-worker-missions/relay-11.cjs D:\GenOS-runs\campagne\11-r1 D:\GenOS-runs\supplement-relais-11-r1
```

Le dossier de supplément doit être nouveau. Le serveur Ollama reste sur
`127.0.0.1:11435`. Le modèle Qwen, la fenêtre et le plafond individuel sont repris
du payload source. Le plafond collectif provient exclusivement du scope persistant
du run source : il n'est ni recréé ni augmenté. Des tokens insuffisants doivent
échouer au contrôle budgétaire normal.

Le helper archive l'inspection source et les hashes SQLite/WAL avant ouverture,
puis les états détaillés avant/après. Il ajoute le destinataire et ses événements
dans la base originale ; il ne crée pas un monde copié. Les fichiers d'évidence et
manifestes de la campagne de base sont conservés. Le supplément possède ses propres
manifestes et expose les consommations cumulées du scope dans `assessment.json`.

Les producteurs 03/10 apparaissent uniquement comme artefacts du dossier source.
Leur identité, provenant d'autres bases, n'est pas injectée dans cette mission.
Le nouveau parent relaye le rapport du worker de liaison terminé avec son hash et
son run. Le destinataire vérifie le transport signé puis persiste son admission.

Un résultat `pass` du supplément exige un destinataire terminé et un événement
GVX d'admission rattaché à ses vrais run et mission. Le champ `semanticAccepted`
reste `false`. La consommation doit être mesurée dans le ledger pour attribuer
une exécution au modèle ; l'admission seule n'atteste ni véracité ni compréhension
du dossier et ne suffit jamais à une promotion.

Validation du chemin runtime sans modèle distant :

```powershell
node backend/tests/test_worker_dossier_handoff_transport.cjs
```

Ce test utilise SQLite, les workers, le routage et les reçus réels avec un provider
simulé ; il ne doit pas être présenté comme une mesure Qwen.

## Essai réel dans une mission encore active

```powershell
node --env-file=.env benchmarks/qwen-worker-missions/live-handoff.cjs D:\GenOS-runs\relais-actif-unique ollama://qwen2.5:14b
```

Ce complément crée une nouvelle mission par les services de production, avec un
parent et un vrai run de budget collectif de 24 000 tokens. Le producteur de type
`liaison_worker` lit un petit fichier de faits, puis le destinataire reçoit son
rapport signé avant la clôture de la mission. Chaque worker possède un plafond de
9 000 tokens ; les deux utilisent le vrai fournisseur Qwen, sans mock ni mode test.
Le protocole s'arrête après cet essai : il ne répète pas jusqu'à obtenir un succès.

Aucune identité de l'ancienne base n'est importée et aucune mission terminale
n'est rouverte. La mission reste active durant les deux exécutions puis est
annulée pour clore l'expérience, sans affirmer de décision parent qualifiée.
Les runs des workers, messages, admissions, réservations et consommations restent
archivés. L'expérience trace sa révision, le modèle, son digest et les versions.

Un `passed` exige deux workers terminés, une consommation Qwen mesurée pour
chacun et une admission liée à leurs vrais runs. Il ne prouve ni la justesse de
leur réponse ni une acceptation sémantique. Ce complément n'est pas la mission 11
complexe de la campagne et ses résultats ne changent pas les 48 scores de base.

Ce driver est réservé à un opérateur. Un contexte `GENOS_EXECUTION_MODE=worker`
est refusé avant toute création de dossier, mission ou budget ; le test
`test_handoff_operator_boundary.cjs` vérifie cette absence de mutation.
