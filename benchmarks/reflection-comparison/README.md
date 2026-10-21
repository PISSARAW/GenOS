# Pilote comparatif de réflexion

Ce banc prépare les trois premières missions recommandées dans le cahier fourni :
branches, budget et porte de preuve. Il ne contient aucun résultat préfabriqué et
n'affirme aucune supériorité de GenOS.

## Protocole

Chaque mission possède deux variantes de difficulté proche. Le plan est un crossover à
deux périodes : chaque mode (`alone`, `genos`) voit chaque variante une fois, mais jamais
la même variante que l'autre mode dans une paire. L'ordre des modes est contrebalancé par
une graine stable. Le modèle, sa version, les outils et les paramètres doivent rester
identiques; seul le recours aux mécanismes GenOS varie.

Le pilote produit 12 essais : 3 missions × 2 répétitions × 2 modes. Deux répétitions
servent à valider l'instrumentation, pas à établir une conclusion statistique.

## Préparer une campagne

Utiliser un checkout propre et noter séparément le modèle et le fournisseur dans le
journal d'opérateur :

```powershell
npm run benchmark:reflection:prepare -- --seed=20261021
```

Le chemin affiché contient `campaign.json` et douze fichiers sous `run-records/`.
`--allow-dirty` existe uniquement pour tester le harnais; son rapport sera marqué
exploratoire.

Exécuter les fichiers dans l'ordre `sequence`. Pour chaque essai :

1. copier la fixture éventuelle dans un workspace neuf ;
2. appliquer exactement le workflow inscrit dans le fichier ;
3. renseigner les temps, jetons, interventions, itérations et verdicts observés ;
4. placer les logs, diffs et reçus sous le répertoire de campagne ;
5. ajouter pour chaque preuve son chemin relatif et son SHA-256 ;
6. passer `status` à `completed` seulement après le verdict du vérificateur.

Une valeur inconnue reste `null`. Elle n'est jamais remplacée par zéro.

## Scorer

L'exécuteur séquentiel utilise le même modèle Ollama dans les deux bras et reprend les
fiches déjà terminées :

```powershell
npm run benchmark:reflection:execute -- --campaign=<chemin>\campaign.json --model=qwen2.5-coder:7b
```

Il conserve stdout, stderr, réponse, oracle et reçu du vérificateur sous le répertoire
de campagne. Un échec d'agent ou de gate est enregistré comme échec expérimental et la
campagne continue. `--retry-failed` ne rejoue que les fiches du bras `alone` en échec ;
les refus GenOS restent des observations et ne sont jamais remplacés silencieusement.

Pour scorer séparément une campagne déjà exécutée :

```powershell
npm run benchmark:reflection:score -- --campaign=<chemin>\campaign.json
```

Le scoreur échoue fermé si un essai, une métrique obligatoire, une preuve ou un reçu de
vérification manque. Il contrôle aussi que chaque preuve reste dans le répertoire de la
campagne et que son empreinte correspond. Le rapport compare réussite vérifiée, temps,
interventions humaines, respect du budget et promotions insuffisamment étayées.

## Validation du harnais

```powershell
npm run test:benchmark:reflection
```

Ce test valide le plan et le scoreur avec des données synthétiques. Il vérifie aussi que
la fixture de pagination reproduit bien son bug initial. Ces données ne sont jamais
écrites dans `benchmarks/**/results/` et ne constituent pas un résultat GenOS.

## Limites

- Le crossover réduit l'effet d'apprentissage mais compare deux variantes, pas une entrée
  strictement identique.
- La présence d'un artefact et son empreinte ne prouvent pas la vérité de son contenu.
- Le mode sans GenOS doit réellement s'abstenir d'appeler les outils GenOS.
- Le mode GenOS exige les reçus du runtime réel; une simulation locale est invalide.
- Une campagne confirmatoire devrait utiliser au moins trois répétitions, davantage de
  tâches gelées et une évaluation indépendante aveugle.
