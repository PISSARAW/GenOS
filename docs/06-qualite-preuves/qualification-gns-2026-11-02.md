# Qualification GNS — État des preuves au 2 novembre 2026

- **Statut** : qualification locale de composants et de chemins runtime ; gain métier et déploiement de production non démontrés.
- **Implémentation de référence** : commit `331a1a071` pour la régulation du Garage, précédé des six raccordements GNS.
- **Dernière revue** : 2026-11-02.

Ce dossier distingue résultats de tests, mesures d'un modèle synthétique et
preuves de fonctionnement en production. Il complète la [fiche GNS](../01-concepts/gns.md),
le [cycle](../02-orchestration/gns-regulation-operationnelle.md) et la
[référence runtime](../03-reference/runtime-gns.md).

## 1. Périmètre et provenance

| Tranche | Révision | Comportement introduit |
| --- | --- | --- |
| Système nerveux initial | `445518863` | récepteurs, physiologie, propagation, stockage et gate d'effet |
| RPE | `eb817a8dd` | relations persistées et graphe scellé par signal |
| AGOW | `cc23c1c1d` | candidat interoceptif dans le cycle réel |
| Morphogenèse | `3251ae104` | observation V2 et besoins consultatifs dans les appelants runtime |
| Ontogenèse | `302cb177e` | historique avant/après, interruptions et purge autorisée |
| SHEV | `492e10687` | capteur enrôlé, suivi, fraîcheur et reprise immuable |
| Huit topologies | `cb6456333` | liaison du lanceur, supervision/dépendances et isolation des missions |
| Régulateur natif du Garage | `331a1a071` | prélèvements, politique signée, limites temporaires, prévision et suivi |

Les fichiers de test et le banc sont versionnés. Les journaux de développement
évoqués ci-dessous sont locaux et ne constituent pas une archive de campagne
signée livrée avec ce document. Les résultats doivent être reproduits dans
l'environnement que l'on veut qualifier.

## 2. Résultats connus de l'intégration

| Vérification exécutée | Résultat constaté | Portée |
| --- | --- | --- |
| suite GNS séquentielle avant le dernier ajout CLI | 127 tests passés | primitives et chemins d'intégration locaux |
| validation CLI ajoutée ensuite, exécutée séparément | 1 test passé | commandes, identité et arguments validés avant initialisation de base |
| régressions Garage controls/dispatch/domains | passées | contrôles, file, autorité, leases, compensation et domaines |
| contrôle qualité global lors de l'intégration | 8 314 fichiers source, aucune violation | règles statiques, pas preuve de réussite métier |
| `cargo test --workspace` lors de l'intégration | passé | suite Rust, pas qualification des fournisseurs externes |
| `npm test` global | démarrage refusé : 319 Mio libres, minimum 512 Mio | suite Node globale non validée par ce passage |

Le nombre de tests décrit ce passage, pas une propriété immuable du dépôt. La
suite actuelle contient aussi le test CLI additionnel. Une exécution groupée
antérieure avait échoué sur un scénario SHEV sensible aux conditions d'exécution
et sur une assertion supposant à tort une prévision exactement égale à 1 malgré
un temps de prélèvement variable. Le scénario SHEV a ensuite passé isolément et
la suite séquentielle a passé. Le seuil de prévision est vérifié sans fabriquer
une durée d'échantillonnage fixe. Les tests aux frontières de fraîcheur utilisent
une horloge contrôlée ; les règles de production ne sont pas assouplies.

## 3. Matrice des contrats testés

| Domaine | Preuve exécutée dans les tests | Ce qui reste hors de cette preuve |
| --- | --- | --- |
| signaux et physiologie | validation, scopes, ancienneté, hystérésis, habituation et priming borné | seuils optimaux ou diagnostic universel |
| durabilité | rollback, reprise SQLite sur fichier, collisions, doublons et connexions concurrentes | absence de perte avant la persistance primaire |
| graphes | cycles, bornes, graphes différents dans un même projet, reprise scellée | tous les détails internes des topologies |
| source de production | sidecar natif `sqlite3`, chemin source réel et relecture persistée | backend complet et fournisseur externe |
| AGOW/morphogenèse | cycle et pipeline appelés, refus des gates, contexte mission | gain causal de décision ou transformation réellement autorisée par ces seuls signaux |
| ontogenèse | dispatch, intégration, échec, suspension, historique et purge | généralisation sur des projets réels |
| SHEV | capteur signé, boucle existante, fenêtres, replay et refus d'autorité | réparation métier par un modèle externe |
| capteurs Garage | compteurs SQLite, date d'origine, cadence et reprise avant projection | consommation CPU/RAM ou qualité métier générale |
| autorité | signature, version, révocation, scope, droits agent et circuit breaker | pouvoir d'agir à partir d'une télémétrie déclarative seule |
| admission | point réel de réservation, maintien en file et remplissage des places libérées | amélioration garantie du débit |
| suivi | récupération observée, aggravation de file, limite propre à l'effet, reprise après crash | preuve causale que l'intervention a produit la récupération |
| calibration | données de même politique, seuils et pas bornés, absence d'application automatique | politique auto-signée ou apprentissage empiriquement optimal |

Le harnais ontogénétique/SHEV utilise des opérations Git et des vérifications
locales mais un exécuteur de tâche injecté. Il ne faut pas le présenter comme
une campagne LLM réelle. Les tests de réservation exercent le chemin de contrôle
du Garage ; cela ne suffit pas à qualifier une flotte de processus externes.

## 4. Banc comparatif à budgets configurés égaux

### Protocole

Le banc versionné [`benchmarks/gns-regulation/`](../../benchmarks/gns-regulation/README.md)
utilise des bases SQLite temporaires et les modules de production pour mesurer,
enrôler les politiques et réserver les places.

Chaque paire utilise le seed 17, douze travaux déterministes, huit tours, une
capacité de cinq workers et un plafond de service de 24 quanta. Le budget
d'admission est de huit tentatives pour `steady`, vingt-quatre pour `burst`.
Le travail modélisé fournit trois quanta par tour, réduits à deux au-delà de
trois workers simultanés. L'oracle de fixture vérifie le hash de son contenu.

Les demandes de ce pilote arrivent au point de réservation ; le banc ne crée
pas une fausse file native pour forcer l'action prédictive. Aucun fournisseur
de modèle ou worker externe n'est exécuté. Les budgets configurés sont égaux
dans chaque paire ; la consommation et le temps réellement passés peuvent différer.

### Résultat du passage qualifié lors de l'intégration

| Charge | Travaux terminés sans GNS | Travaux terminés avec GNS | Temps total de prélèvement du bras GNS |
| --- | --- | --- | --- |
| `steady` | 5 | 5 | 3 392,06 ms sur huit tours |
| `burst` | 5 | 5 | 6 244,13 ms sur huit tours |

Ces temps dépendent de la machine et de sa charge. L'égalité du nombre de travaux
terminés après huit tours ne démontre pas l'égalité du débit en temps réel :
le prélèvement ajoute du temps. Le passage ne démontre donc ni accélération,
ni bénéfice général en production. Les travaux encore inachevés et les autres
métriques figurent dans la sortie JSON du banc.

### Contre-épreuve ayant modifié la conception

Un premier passage avait terminé moins de travaux dans le bras régulé sur la
charge régulière. Deux causes ont été corrigées : une prévision trop
interventionniste et un gel complet des admissions après baisse de l'occupation.
La prévision est maintenant consultative par défaut ; son action exige une
option signée et une file native corroborante. La limite temporaire permet de
remplir les places libérées. Ce résultat négatif reste une preuve utile ; il ne
doit pas être effacé par la présentation des tests passés.

## 5. Reproduction

Depuis la racine, avec les dépendances du backend et un Node compatible avec
`node:sqlite` pour les fixtures :

```powershell
node --test --test-concurrency=1 backend/tests/nervous/*.test.js
node backend/tests/test_garage_runtime_control.js
node backend/tests/test_garage_runtime_dispatch.js
node backend/tests/test_garage_domains.js
node benchmarks/gns-regulation/run.cjs
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

La commande du banc écrit son rapport JSON sur stdout. Conserver commandes,
révision, environnement, codes de sortie et résultats des deux bras. Aucun
journal généré, base SQLite, secret ou fichier de politique local ne doit être
committé pour remplacer une preuve manquante.

Si le garde-fou disque ou le verrou global refuse `npm test`, enregistrer ce
refus et relancer après résolution de la condition. Ne pas désactiver le garde-fou
ou reprendre le succès d'une suite lancée par un autre processus comme son propre résultat.

## 6. Qualification restant à produire

- Charge représentative sur projets réels et budgets comparables, avec oracle métier indépendant.
- Faux positifs, occasions d'intervention manquées et effets de la collecte sur la latence.
- Robustesse aux dérives d'horloge, interruptions, saturation et rétention sur longue durée.
- Comparaison des politiques de seuils et de prévision, en conservant aussi les résultats défavorables.
- Régression transversale complète dans un environnement disposant de l'espace requis.

Ces objectifs sont une qualification future, pas des capacités ou résultats déjà acquis.
