# ADR 0332 — Exécution et provenance des cinq capacités de morphogenèse

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Backend, morphogenèse, mémoire et observation résidente
- **Lié** : ADR 0299 — capacités transversales de morphogenèse

## Contexte

Les deux premières tranches fournissaient scores, registres et quelques gates.
Elles ne suffisaient pas à établir une occupation expérimentale, une restauration
d'essai, une observation réelle, une compression rejouée ou une provenance
statistique héritée par tous les propriétaires du runtime.

## Décision

1. Ajouter des artefacts immuables et confinés au scope avec empreinte canonique.
2. Sceller les vagues expérimentales atomiquement après vérification complète ;
   relier le registre scientifique Trinity et les niches Biome aux contrats.
3. Exécuter la spirale via un harnais autorisé avec snapshot et restauration.
4. Dispatcher seulement des sondes résidentes SQL autorisées, compter observations,
   erreurs et fenêtres manquées, puis rétroagir sur la phase admissible.
5. Rejouer les procédures déclaratives dans un worker borné avant compression ;
   revalider contexte et dépendances lors du rappel, invalider transitivement.
6. Enregistrer protocoles et manifestes statistiques avant observation, conserver
   unités sources et grants hérités, contrôler les promotions de nœuds liés.
7. Activer chaque capacité par contrat. Publier un CLI opérateur local ; ne pas
   annoncer de nouveaux outils MCP ni une parité Rust qui n'existent pas.

La migration 115 ajoute uniquement des tables et contraintes de ces parcours.
Le registre de risque n'est pas restauré par les snapshots des interventions.

## Conséquences

Les scores restent des propositions ; les reçus liés aux preuves commandent
les gates. Les vérificateurs et harnais sont des frontières de confiance.
La preuve de préservation de mémoire est limitée aux cas conservés et aux règles
déclaratives. La borne statistique dépend de l'hypothèse nulle conditionnelle.
Les benches sont reproductibles et synthétiques ; ils ne prouvent pas la
supériorité de φ ou une qualification sur des incidents industriels.

Les anciennes APIs restent compatibles. Le chemin protégé exige scope, sources
et propriétaires enregistrés ; l'absence de contrat bloque un propriétaire lié.

## Alternatives examinées

- Valider des booléens de l'appelant : rejeté, aucune preuve exécutable.
- Exposer un shell de sonde ou évaluer les procédures comme JavaScript : rejeté,
  inutile pour les contrats et contraire au confinement.
- Activer toutes les capacités dans chaque mission : rejeté, activation par besoin.
- Réémettre un budget après transition ou archive : rejeté, double comptage du risque.

## Vérification

`npm --prefix backend run test:capabilities` couvre les trois tranches.
`npm --prefix backend run bench:capabilities` exécute les ablations synthétiques.
Les gates globales restent obligatoires ; un transport réussi ou un benchmark
favorable ne les remplace pas.



## Résultats de validation du 6 octobre 2026

Base : `cd19c6b4`, branche `codex/morphogenesis-completion`.
L'implémentation et les tests concernent le backend Node ; aucune parité nouvelle
avec le serveur MCP Rust n'est annoncée.

| Contrôle exécuté | Résultat |
| --- | --- |
| Deux suites des premières tranches | Réussite |
| Sept groupes runtime : vague, spirale, sonde, cambium, risque, intégration, scientifique | Réussite |
| `npm test` à la racine | Réussite : backend, autorité, AEIS, Syncytium, Axolotl et Garage |
| `cargo test --workspace --offline -j 2` | Réussite, y compris doctests |
| Syntaxe des fichiers JavaScript modifiés | Réussite |
| Gate des fichiers modifiés | Zéro violation nouvelle |
| Index ADR | 382 fichiers, 382 lignes, zéro problème |
| Gate qualité globale | Échec : 179 violations préexistantes hors dette reconnue par la baseline ; aucune augmentation par ce chantier |
| Régressions ciblées complémentaires | Six réussites ; un échec préexistant dans `test_morphology_graph_execution.js` |

L'échec complémentaire concerne « evidence dossiers must be collected ».
Le même test et la même assertion échouent avec les 25 modules backend modifiés
remplacés en mémoire par leurs sources du commit de base. Ses assertions sont
conservées ; les preuves de promotion ne sont pas assouplies pour le faire passer.
La comparaison qualité examine aussi les sources du HEAD et ne trouve aucun
fichier dont le nombre de violations ait augmenté.

Les tests AEIS de sandbox et de reprise avaient atteint leurs délais de fixture
sur cette machine chargée. Leurs délais ont été alignés sur les budgets existants
(60 s et 180 s), sans modifier les protections de production ni leurs assertions.

Les benchmarks sont exécutables avec seed 42. Le méristème comportemental résout
quatre cas sur quatre contre trois par rôle et deux par DPP dans ce petit corpus.
Le jitter peut dépasser la rotation dans la détection périodique. Les politiques
de spirale comparées donnent le même coût sur ce corpus. Le cambium préserve les
100 décisions rejouées ; les rétentions simplifiées en changent une ou deux.
Les deux ratios statistiques produisent neuf campagnes nulles promues sur 100
simulations : ce taux ne valide pas empiriquement une borne de 5 % et n'est pas
présenté comme une garantie. Ces ablations ne sont pas des expériences de modèles
de langage ni des incidents industriels exécutés par des workers GenOS.

Le workflow GenOS a permis de consulter les mémoires d'échecs. Le hook n'a pas
fourni d'identité de session utilisable pour un checkpoint GenOS ; aucun snapshot,
replay ou enregistrement MCP de cette implémentation n'est déclaré exécuté.
Les décisions et commandes reproductibles sont conservées dans cet ADR et Git.
