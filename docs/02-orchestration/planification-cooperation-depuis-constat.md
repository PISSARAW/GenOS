# Planifier la coopération depuis le constat du daemon

- **Statut** : implémenté dans le pilote borné de qualification.
- **Portée** : allocation entière, runtime Node, modèle Ollama et oracles natifs.
- **Dernière revue** : 2026-11-04.
- **Décision** : [ADR 0793](../adr/0793-plan-cooperation-fonde-sur-constat.md).

## Ordre causal et preuves

Le pilote lit une allocation réellement présente dans le workspace et lance
`resident_daemon`. Son observation passe le contrat `resource_allocation` et deux
processus d'oracle avant d'être admissible comme entrée du planificateur.

`workerCooperationFinding` relit le reçu et le binding dans SQLite, vérifie type,
mission, parent et preuve native, puis compare les fichiers d'origine à leurs
empreintes scellées. Le modèle ne peut donc pas remplacer un constat par un run
étranger ou travailler sur des octets modifiés depuis l'observation.

L'entrée `planningInput` contient le constat, les valeurs, les indices depuis zéro,
les références de source, le catalogue des rôles et leurs prérequis. Elle est
conservée dans le rapport. Le daemon n'est pas une étape à réinventer : il a déjà
produit la preuve d'entrée.

## Contrat de réponse

```json
{
  "findingRunId": "run du daemon fourni dans l'entrée",
  "decision": "repair",
  "steps": [
    {"kind":"specialist","dependsOn":["finding"],"goal":"Proposer des indices totalisant la cible observée."},
    {"kind":"verifier_worker","dependsOn":["specialist"],"goal":"Recalculer la proposition depuis les valeurs d'origine."},
    {"kind":"recovery_worker","dependsOn":["verifier_worker"],"goal":"Restaurer le checkpoint accepté si l'état courant diffère."}
  ]
}
```

Cet exemple illustre le cas en anomalie ; le validateur n'injecte pas cette
réponse. Le schéma laisse le modèle proposer les étapes et objectifs, et le
validateur contrôle leurs préconditions. Les enums reprennent les identifiants
exacts du runtime, sans accepter `observes` ou `proposes` comme types.

Quand le constat ne contient pas d'anomalie, la seule réponse admissible est
`decision: stop` avec `steps: []`. Avec anomalie, chaque rôle restant est nécessaire
une fois et ses prérequis doivent être nommés et déjà disponibles. Un ordre
incorrect, une référence étrangère ou un daemon ajouté au plan sont refusés.

Le constat et ses sources sont revérifiés avant chaque étape restante.
Les objectifs acceptés sont transmis comme contexte aux workers. Ils ne modifient
ni leurs droits, ni les oracles, ni le bail de restauration. Le vérificateur est
distinct du spécialiste. L'application du checkpoint reste conditionnelle à son
acceptation et à la différence de digest ; aucune promotion source n'est autorisée.

## Exécution et ressources

Choisir un répertoire encore inexistant sur D: et créer un fichier de configuration :

```json
{"root":"D:/GenOS-runs/cooperation-evidence-nouveau","model":"ollama://qwen2.5-coder:7b","scenario":"incorrect"}
```

```powershell
$env:GENOS_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/api/chat'
node backend/bin/qualify-worker-cooperation-live.cjs D:/GenOS-runs/cooperation-config.json
```

`scenario: healthy` utilise une allocation saine pour vérifier l'arrêt sans
spécialiste, vérificateur ou restauration. Le défaut est `incorrect`.

Le plafond partagé des workers reste 64 000 tokens, 1 USD fournisseur déclaré et
12 minutes. Le planner est borné à 768 tokens de sortie, 4 096 tokens au total et
120 secondes. Le plafond total du rapport est donc 68 096 tokens. Une mesure
manquante reste inconnue ; si le daemon échoue avant le planner, sa consommation
de planification est exactement zéro. Les coûts matériels locaux ne sont pas
déduits d'une facturation fournisseur nulle.

## Rapport et vérification

Le format v3 conserve `finding`, `planningInput`, la réponse brute, `acceptedPlan`,
`responseDecision`, les runs et reçus de chaque worker, toutes les tentatives et
l'état de fermeture. `qualified` porte sur ce protocole ; `genosMissionQualified`
reste faux et aucune complétion native générale de la mission racine n'est affirmée.

```powershell
node backend/tests/test_worker_cooperation_planner.cjs
node backend/tests/test_worker_cooperation_live.cjs
```

Le premier contrôle les contrats et les sources modifiées. Le second utilise un
transport HTTP contrôlé avec les vrais dispatchs, bases, capsules et oracles :
réparation, allocation saine, plan mal ordonné et abstention du daemon. Il vérifie
notamment que le premier appel est l'observation, et que le planner cite son run
vérifié. Ces tests n'annoncent aucune qualification d'un vrai modèle.

## Limites

Le problème, le catalogue et les dépendances de sécurité sont bornés et connus.
Ce protocole mesure une réponse conditionnelle fondée sur des preuves, pas une
capacité générale de planification. Les [deux refus réels précédents](../06-qualite-preuves/cooperation-llm-plan-refuse-2026-11-04.md)
restent des résultats négatifs. Une nouvelle exécution réelle doit être analysée
séparément, sans confondre les sorties HTTP prédéfinies et les générations LLM.

La [relance réelle du 2026-11-04](../06-qualite-preuves/cooperation-llm-constat-daemon-2026-11-04.md)
est refusée avant le planificateur dans les deux cas : les dossiers du daemon
ne satisfont pas le contrat d'observation. Les tests ciblés passent ; la
coopération complète avec ce vrai modèle reste à qualifier.
