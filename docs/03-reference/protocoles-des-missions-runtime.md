# Les sept protocoles dans le runtime de mission

Les nouveaux runs Node ayant une identité de mission et une enveloppe d'autorité
scellée utilisent les protocoles aux frontières ci-dessous. Aucun drapeau client
ne permet de retirer les contrôles d'un run déjà lié. Les appels historiques sans
liaison de mission et la planification initiale restent des parcours distincts ;
ils ne sont pas présentés comme une exécution des sept profils.

Le [lancement local Windows](protocoles-mission-windows.md) emploie le même cycle
de préparation, scellement et contrôle d'exécution. L'[API d'actions signées](mission-protocols-actions.md)
peut adopter un run natif déjà scellé avant sa première action : elle vérifie son
autorité et sa provenance et conserve les budgets natifs d'action. Cette adoption
ne reconstruit pas un ancien contexte SYNAPSE ni une exposition ALLOSTASIE absente.

L'entrée CLI `dispatch_worker` crée également un vrai run de contrôle parent,
avec enveloppe scellée et budget natif, avant de lancer l'enfant. Le CLI alloue
son propre scope modèle ; les scopes fournis sont refusés avant création d'un
run. La fermeture de ce contrôle ne constitue pas une décision parent terminée.

| Protocole | Frontière réellement raccordée | Portée actuelle |
| --- | --- | --- |
| [EVIDENCE](mission-protocols-evidence.md) | Complétion avant progression native et dossier après application | Oracle indépendant installé, rapport et autorité exacts ; un succès déclaré ne suffit pas |
| [CONTINUITY](protocoles-mission-continuity.md) | Admission d'incarnation et écriture des événements de progression | Générations monotones par agent logique, même transaction de contrôle que l'effet SQL |
| [MORPH](protocoles-mission-morph.md) | Transition native après admission Rust | Topologie et rebind, un participant local réel ; spawn, retrait et extension de droits refusés dans ce profil |
| [OMEGA](mission-protocoles-omega.md) | Graphes natifs et inférences du routeur de modèles | READ, SELECT, CHECK, INFER et ressource durable mission.result ; politiques et budgets natifs conservés |
| [GQWF Exchange](mission-protocoles-gqwf.md) | Préparation/finalisation d'un workspace GQWF et promotion réservée | Monde CAS réel, fermeture native et preuve de syntaxe CommonJS du récepteur ; ne remplace pas les critères métier ni l'approbation humaine |
| [SYNAPSE](mission-protocols-synapse.md) | Contexte parent/worker avant scellement puis contrôle avant exécution | Dictionnaire natif, delta réellement appliqué et reçu durable ; pas de pair inventé pour une mission feuille |
| [ALLOSTASIE](mission-protocols-allostasie.md) | Admission du worker, arrêt demandé et fin observée | Temps mur exact, réserve protégée de 5 %, exposition conservée quand la mesure est inconnue |

## Autorité et conservation

`mission_protocol_runs` lie run, mission, agent, tenant, workspace et enveloppe
scellée. La vérification relit la provenance GVX native : modifier seulement le
nom de mission, le workspace ou l'acteur dans une demande ne transfère pas son
autorité. Omettre l'identifiant du run ne permet pas de revenir au parcours
historique lorsqu'un run protégé est actif.

Les journaux protocolaires sont dérivés du chemin de la base de contrôle, sous
`<base>.protocols/`. Les chemins ne viennent pas du message de mission. EVIDENCE
et GQWF conservent aussi leurs dossiers dans la base de contrôle ; CONTINUITY y
conserve ses checkpoints et son propriétaire courant. Les effets inconnus ne
sont ni déclarés réussis ni répétés sur la seule base d'une livraison réussie.

La reprise des observations biologiques passe par les mêmes gardes de protocole
que l'exécution initiale. Une preuve acceptée dans un journal séparé n'autorise
pas à déclarer terminée une transaction métier qui a échoué.

## Vérification

```powershell
npm --prefix backend run test:mission-protocols
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

La suite comprend une vraie mission native traversant EVIDENCE, CONTINUITY,
SYNAPSE et ALLOSTASIE ; les opérations MORPH, OMEGA et GQWF sont vérifiées sur
leurs frontières natives pertinentes. Les tests emploient des bases isolées,
de vrais processus pour les coupures et un fournisseur HTTP local pour
l'inférence. Ce fournisseur est un banc déterministe, pas une mesure de qualité
d'un LLM externe. Les sept profils restent expérimentaux et bornés à leurs
adaptateurs ; cette intégration Node n'est pas une nouvelle implémentation Rust.
