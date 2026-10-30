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
node benchmarks/qwen-worker-missions/relay-11.cjs D:\GenOS-runs\campagne\11-r1 D:\GenOS-runs\supplement-relais-11-r1
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
