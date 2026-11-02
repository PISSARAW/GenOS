# Première mission AGOW reliée à des mesures vérifiées

- **Date** : 2026-11-02
- **Statut** : instrumentation Node et démonstrateur local exécutés
- **Portée** : agrégation déterministe de commandes ; diffusion locale AGOW
- **Promotion** : aucune
- **Contrat** : [observation de mission](../03-reference/observation-mission-agow.md)

## Question et protocole

Vérifier qu'une décision AGOW antérieure à l'exécution peut être reliée à un
résultat mesuré, même si le worker annonce un succès erroné. Ce chantier qualifie
la chaîne d'instrumentation ; il ne teste pas la supériorité d'une politique.

Le [runner](../../benchmarks/agow-mission/README.md) fixe les entrées et les deux
conditions avant les exécutions. Il soumet un candidat au vrai pool, exécute le
cycle AGOW avec ignition, sélection du mode `ACT`, frame et diffusion locale.
Le receiver transmet les commandes au worker. Une liaison mission/run/frame/reçu
de mode est persistée avant de lancer ce worker dans un processus Node distinct.

La tâche consiste à additionner les quantités strictement positives par client.
L'oracle, dans un autre processus, utilise les commandes d'origine et une autre
implémentation pour mesurer la fraction des totaux incorrects. Le worker avec
faute ajoute volontairement 1 au premier total. Les deux processus workers
terminent avec le code 0 et l'hôte émet dans les deux cas `AGENT_COMPLETED`.

## Exécution observée

```powershell
node benchmarks/agow-mission/run.cjs
node benchmarks/agow-mission/verify.cjs .genos-agent-worlds/agow-mission-observation/ed2068fa-57e2-44e0-85ab-6af6fba6384a
```

Les deux commandes terminent avec code 0. La vérification relit les observations
depuis SQLite dans un autre processus, recoupe manifeste, sources importantes,
événement et empreinte de la réponse, puis réexécute l'oracle.

| Condition | Perte prévue AGOW | Perte mesurée | Écart | Tâche réussie |
| --- | ---: | ---: | ---: | --- |
| Worker correct | 0 | 0 | 0 | Oui |
| Worker avec faute injectée | 0 | 0,5 | 0,5 | Non |

La perte prévue vaut ici 0 parce que le coût `ACT` est explicitement fixé à 0
dans le démonstrateur. Ce prior n'est pas une prédiction statistiquement calibrée.
Les deux observations sont `verified` : ce statut porte sur les mesures et non
sur la réussite de la tâche. Aucun résultat n'est crédité à la plasticité.

Les temps des deux processus workers observés sont respectivement d'environ
1 185 ms et 894 ms. Ils incluent le démarrage et la contention de cet hôte ; ils
ne constituent pas une comparaison de performances. Tokens, coût financier,
réserve de ressources, stabilité et nombres de blocages non mesurés restent
explicitement `null`.

## Provenance locale

- Révision Git de base : `f05418fcc4ee433fe01bcb28daf6b1757bec3a79`.
- Sources locales modifiées avant commit ; leurs hashes importants sont dans le
  manifeste. Le seul HEAD ne décrit pas ces modifications.
- Dossier ignoré par Git :
  `.genos-agent-worlds/agow-mission-observation/ed2068fa-57e2-44e0-85ab-6af6fba6384a/`.
- Manifeste :
  `sha256:02e54ea5cec8022ecc1c8a783715260279a9663d7bc3ebc486c65a501585a979`.
- Fichiers conservés : `manifest.json`, `report.json`, `receipts.sqlite`.

Les hashes établissent la cohérence locale des contenus ; ils ne signent pas une
autorité externe. Le manifeste ne copie pas toutes les dépendances transitives.
Une modification ultérieure d'une source épinglée exige une nouvelle exécution ;
le vérificateur refuse la dérive des sources.

## Vérifications logicielles

La suite `npm --prefix backend run test:agow:mission` couvre notamment :

- refus des succès autodéclarés, identités discordantes et preuves absentes ;
- délai, annulation coopérative et refus des réponses tardives ;
- doublons, conflits concurrents et reprise après réouverture de SQLite ;
- isolation des callbacks par agent et connexion ;
- réutilisation de la liaison après expiration de l'historique des frames ;
- raccord réel du planning et de l'ingress avec frontières externes simulées ;
- worker et oracle distincts, détection d'une réponse substituée dans l'archive.

La suite AGOW existante a également terminé avec code 0. Le contrôle qualité
global et l'index ADR ont terminé avec code 0 lors des vérifications de ce chantier.

La validation globale du dépôt ne peut pas être annoncée verte : `npm test` est
refusé par son précontrôle d'espace libre (491 MiB disponibles pour 512 MiB requis).
`cargo test --workspace` échoue dans
`same_initial_state_and_seed_reproduce_identical_lineage_after_cli_restarts`,
du test `biological_ecology_reproduction_campaign` de `genos-cli`. Aucun fichier
Rust n'est modifié par ce chantier. Ces résultats ne sont pas remplacés par les
tests ciblés Node.

## Limites et suite

Ce parcours n'utilise pas le superviseur complet, de modèle LLM ou de transport
réseau ; les parcours natifs sans ingress doivent appeler l'API explicitement.
La mesure d'une erreur métier sur deux cas ne prouve aucun gain causal d'AGOW,
aucun apprentissage ni aucune aptitude à réorganiser une mission. Les dimensions
allostatiques du collectif doivent encore recevoir des mesures métier réelles.

La suite consiste à fournir un oracle métier indépendant pour une mission
supervisée, définir les unités et horizons des métriques, puis comparer des
politiques sous budgets appariés et ablations préenregistrées.
