# Contexte natif complet avant les données exactes de génération

- **Statut** : Implémenté pour la sérialisation ; bénéfice rédactionnel à mesurer.
- **Dernière revue** : 2026-11-04.

## Contexte

Dans la tentative 11 du Dernier Sas, le prompt réel de la scène contient bien
le contexte natif complet. Ce contexte d'environ 14 000 caractères termine
toutefois les données JSON par des souvenirs historiques, dont des conseils
SQLite sans rapport avec la scène. Les données précises de cette étape, son
changement de situation et son volume indicatif se trouvent avant cette fin.

L'effet de cette position sur les répétitions est une hypothèse. Le plan
provisoire circulaire et le plafond de sortie excessif constituent d'autres
explications ; changer l'ordre ne prouve aucune amélioration causale.

## Décision

Les opérations `narrative_plan` et `write:*` sérialisent désormais le champ
canonique `nativeMissionContext` avant les données exactes de l'étape. Sa valeur
est toujours celle de la mission native. Un champ homonyme dans les données
de réparation est remplacé par cette valeur, sans supprimer les autres données.

Les octets du contexte, les règles, le plan, les scènes précédentes et les
obligations de réparation sont conservés. La séparation entre les instructions
et les données JSON reste la première nouvelle ligne. Les revues et la
matérialisation exacte ne sont pas transformées par cette opération.

## Conséquences et vérification

`test_gqel_native_context_order.cjs` emprunte le préparateur réellement exposé
par les options natives. Il vérifie l'ordre des champs, les octets Unicode et
retours de ligne, les données complètes, le remplacement d'un contexte fourni
par les données et une seconde préparation de réparation. Aucun LLM n'est
appelé et aucun verdict artistique n'est simulé.

Les budgets, l'autorité, les critères et les gates restent inchangés. Une
nouvelle expérience peut évaluer l'hypothèse rédactionnelle séparément de
ces invariants de sérialisation.

## Alternatives

- Retirer les souvenirs ou raccourcir le contexte : perte de contexte natif.
- Accepter le champ fourni par les données : remplacement possible du contexte canonique.
- Déclarer l'amélioration avant la relance : affirmation sans mesure.
