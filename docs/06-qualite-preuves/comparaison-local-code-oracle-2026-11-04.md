# LocalCodeWorker : oracle JavaScript natif et graphe de vérité

Le domaine `javascript_repair_cases` couvre désormais les trois missions bornées
du protocole. Le contrat est persisté avant l'incarnation et le scellement de
l'autorité. Deux processus oracle contrôlent l'artefact réel ; le graphe rattache
les événements à la mission authentifiée et conserve les reçus négatifs.
Une réussite annoncée avec un oracle réfuté reste rejetée.

La relance du 4 novembre 2026 a terminé **18 essais sur 18 en 936 255 ms**, soit
**15 min 36,255 s** dans la fenêtre mesurée de 25 minutes, de 14:01:40,290 à
14:17:16,545 heure de Paris. La préparation, la calibration et le préchauffage
sont exclus et archivés séparément. Les trois missions, les génomes, les graines,
l'ordre alterné et les budgets sont ceux du manifeste initial : un appel modèle,
8 192 tokens totaux, 1 536 tokens en sortie et 120 secondes par essai.
Les dix-huit essais respectent ces budgets ; aucun échec n'est relancé.

| Mesure | LocalCodeWorker, 0,45 | Variante, 0,2 |
|---|---:|---:|
| Qualifications natives dans les budgets | 2/9 | 3/9 |
| Assertions réussies | 57/108 | 68/108 |
| Tokens observés, total | 14 609 | 14 631 |
| Génération, médiane | 3,046 s | 2,998 s |
| Processus complet, médiane | 50,409 s | 46,649 s |
| Coût monétaire et énergétique | non mesuré | non mesuré |

Les cinq qualifications concernent la pagination. Dix autres candidats sont
réfutés par les oracles et trois échouent avant leur exécution aux tests locaux.
Les dix-huit graphes sont mesurés. Le contrôle de rapport refuse les dix réussites
annoncées dont les postconditions sont réfutées. Les trois graphes de refus local
restent valides comme constats d'échec ; ils ne qualifient pas leurs candidats.
Il n'y a aucun refus observé de domaine oracle ou de graphe indisponible.

L'audit indépendant est **PASS** : dix-huit bases inspectées en lecture seule,
MAC d'autorité et d'incarnation vérifiées, résultats des assertions rejoués,
neuf paires avec paramètres égaux sauf température. Les prompts sont égaux après
normalisation analytique des deux seules lignes de nonces d'identité natives ;
les requêtes originales restent intactes. Les 11 765 fichiers du dossier figé
sont inchangés avant/après campagne.

Les reçus attestent la décision prise pendant chaque essai. Les autorisations de
120 secondes expirent normalement ensuite ; l'audit distingue leur validité
historique de leur validité courante et ne prolonge aucun délai.

Les deux ADN restent DRAFT, le génome canonique est inchangé et chaque base
expérimentale contient zéro innovation promue. Le contrôleur du benchmark est
local ; la mesure couvre les workers natifs, leurs oracles et le contrôle de
rapport du parent. Elle ne qualifie pas un contrôleur autonome complet GenOS.
Ce petit corpus connu et la charge variable de la machine ne permettent pas
d'affirmer une supériorité générale de la température 0,2.

Les preuves se trouvent dans :

`D:/GenOS-Experiments/local-code-temp-oracle-stable-20261104/archive/oracle-1793797263299`

- `manifest.json`, empreinte `e2905263d5a6a650b1c7a5b595419f7a53dbd39e6e7b356a36caab2406b2c5f8` ;
- `results.json`, `campaign-start.json`, `campaign-end.json`, `source-integrity.json` ;
- `runs/*/` : requêtes/réponses réelles, autorité, incarnation, bases, reçus,
  observations, inspection oracle, graphe et qualification ;
- `verifications/independent-1793798254588/verification.json` : audit indépendant.

L'index `evidence-index.json` couvre 789 fichiers ; son empreinte SHA-256 est
`bb21d87be9e0b6c3fa82f9125f62fe61146b9dc409348303281d21c10eeff1b2`.

Le modèle est `qwen2.5-coder:7b`, empreinte
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
Les sources reprennent `01333f81c` avec `eb7b89601` et l'archive du correctif,
empreinte `f98c4eaffa5b9e0b8e23dffc48dfaf717df63e665eef6e1d1393200fe3c67728`.
Le validateur du dépôt a ensuite précisé le type booléen de `mutable` ; tous les
contrats mesurés utilisent déjà `true`. Les preuves figées ne sont pas réécrites.

Le noyau oracle, les mutants incorrects, le refus de mutation des arguments et
le confinement borné passent leurs tests. Le test d'intégration du dépôt passe
aussi : qualification positive réelle, reçu négatif, deux processus, refus du
rapport injustifié et invalidation courante après altération de l'artefact.
Les contrôles globaux du dépôt sont consignés séparément dans le dossier
`validation/` du laboratoire ; l'audit expérimental ne les remplace pas.

Au dernier passage, le contrôle qualité couvre 9 057 sources sans violation et
les tests ciblés oracle/graphe/intégration passent. `cargo test --workspace`
termine avec le code 101 : le test
`coordinator_can_read_only_a_delegated_artifact_actually_received_before_its_current_turn`
échoue sur `MISSION_LEASE_EXPIRED` (six autres tests de ce fichier passent).
Cet échec était déjà conservé dans la validation de la campagne native précédente.
`npm test` termine avec le code 1 au précontrôle : une autre suite détient le
verrou global, PID 2576. Le verrou reste intact et aucune suite globale verte
n'est annoncée.
