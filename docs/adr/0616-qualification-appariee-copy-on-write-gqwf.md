# ADR 0616 — Qualifier GQWF par comparaison Copy-on-Write appariée

- **Statut** : Accepté pour la qualification locale
- **Date** : 2026-10-18
- **Domaine** : GQWF, workspaces, benchmark, activation progressive

## Contexte

Les vues GQWF partagent une racine et ne créent un blob qu'à la première
écriture distincte. Les mesures existantes décrivent les phases internes de
GQWF, mais ne les comparent pas à la création de copies physiques complètes.
Les ADR 0369 et 0371 interdisent de revendiquer un gain de temps ou d'espace
avant une mesure du cycle pertinent.

Une comparaison de latence unique serait insuffisante : caches, antivirus,
charge disque et ordre d'exécution peuvent dominer un run local. La taille du
WAL SQLite peut elle aussi varier indépendamment des octets logiques stockés.

## Décision

Ajouter le protocole local `gqwf-cow-paired-v1`. Chaque répétition exécute deux
bras sur les mêmes contenus déterministes :

- le bras `physical` crée N copies complètes puis écrit le même overlay dans
  chacune ;
- le bras `gqwf` importe une base, crée N vues logiques puis écrit le même
  overlay dans chacune.

Le protocole exige au moins trois répétitions et alterne l'ordre des bras. Il
conserve les mesures brutes de chaque paire. Les deux premières et dernières
projections sont relues, le nombre de fichiers et les octets de contenu sont
vérifiés, et les échecs interrompent le run.

Les octets de contenu GQWF, les métadonnées SQLite et les latences sont
rapportés séparément. Le résumé calcule des distributions, mais le rapport
porte explicitement `performanceClaim: none` : aucun seuil de latence ou ratio
d'espace ne déclenche une activation automatique.

## Conséquences

- Le partage Copy-on-Write devient vérifiable face à une baseline concrète.
- Les répétitions défavorables restent visibles ; elles ne sont ni supprimées
  ni remplacées par une moyenne favorable.
- Un run local qualifie le protocole et ses invariants, pas une performance
  universelle ni la capacité à exécuter des milliers d'agents.
- L'activation par défaut de `gqwfV2` reste hors de portée. Elle demandera des
  campagnes sur machine isolée, des charges représentatives et des critères
  d'exploitation décidés séparément.

## Validation

`node backend/tests/test_gqwf_cow_benchmark.js`

`npm run benchmark:gqwf-cow -- --views=10 --repetitions=3`
