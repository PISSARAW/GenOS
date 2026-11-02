# GQEL V2.1 — validation ciblée du 2 novembre 2026

## Périmètre

Base examinée : `6fa045396e15bb3ab5d1adedcb8d64a7e5cebe11`.
Exécution locale avec Node.js **v22.16.0**, dans un snapshot partiel des modules et tests GQEL.
Les sources ont été lues via le connecteur GitHub ; le clone réseau complet n'était pas disponible.
Les dépendances GQEL inchangées utilisées par les tests ont été comparées aux empreintes de blobs du dépôt.
Le test V2 d'origine a également été reconstruit et son blob contrôlé avant adaptation de trois attentes devenues explicites.

## Résultats exécutés

| Contrôle | Résultat | Limite |
|---|---|---|
| `node backend/tests/test_gqel_v2.cjs` | **50/50 réussis** | Réponses de modèles et HTTP synthétiques. |
| `node backend/tests/test_gqel_progress.cjs` | **35/35 réussis** | Contrôles logiciels, aucune œuvre produite par un LLM réel. |
| `node --check` sur les 23 fichiers JS/CJS présents dans le snapshot | Réussi | Pas une validation de tout le monorepo. |
| Scanner ciblé reprenant les règles JS de `check_code_quality.py` | **23 fichiers, 0 violation** | Gate global et baseline du dépôt complet non exécutés. |

Les 50 cas de la suite V2 sont conservés. Les attentes adaptées concernent le nombre de contrôles initiaux,
les reprises locales de format, et le veto de plan désormais explicitement activé dans le test de politique stricte.

## Contre-exemple reproduit avant correction

Source : `Alain refuse de sortir de la station.`
Citation fausse : `Alain accepte de sortir de la station.`

L'algorithme `findSubPhrase` de la base retournait le suffixe `de sortir de la station.` comme ancrage.
Le nouveau validateur rejette la citation entière avec `GQEL_REVIEW_UNGROUNDED`. La citation exacte reste acceptée.

## Nouveaux cas positifs et négatifs

- Refus des inversions de sens, préfixes inventés et fragments recollés ; acceptation de citations exactes séparées.
- Prompts de plan et d'artefact distincts ; contrôles positifs pour objectif partagé et résumé de plan.
- Réparation locale d'une durée prévisionnelle, conservation du plan précédent et des durées originales.
- Brouillon produit après refus persistant de plan ; rejet final maintenu si la causalité ou la durée restent non établies.
- Politique stricte conservée ; aucun brouillon autorisé depuis un plan structurellement invalide.
- Reprise d'un verdict incomplet ou d'une citation fausse sans régénérer l'œuvre.
- Préservation du candidat quand les reprises du juge sont épuisées ; respect du budget global et des timeouts.
- Réparation locale d'un en-tête de scène ; conservation de la première scène si la suivante échoue.
- Transmission effective du schéma JSON à l'adaptateur HTTP simulé ; prise en compte de sa taille dans le contexte.
- Comparaison A/B et B/A avec reprise de protocole bornée ; empreintes des brouillons persistés contrôlées.
- Validation des nouvelles options, valeurs nulles de plan et totaux de durée non finis.

## Non exécuté

- Aucune génération réelle avec `llama3.1:8b` ou un autre modèle.
- Pas de lecture artistique humaine, de preuve de gain causal, ni de comparaison à budget égal avec le modèle seul.
- `npm test`, `cargo test --workspace`, gate global et `test_quality_elevation_loop.js` avec dépendances A-Team natives à lancer sur le checkout complet.
- Pas de test de bout en bout de tous les dispatchs, leases et services persistants GenOS.

## Relance opérateur

```powershell
node backend/tests/test_gqel_v2.cjs
node backend/tests/test_gqel_progress.cjs
node backend/tests/test_quality_elevation_loop.js
node scripts/experiments/run_writing_mission_gqel.cjs --model=llama3.1:8b --out=artifacts/gqel-v2-1-run
```

Conserver les versions, les diagnostics complets, les appels et leurs usages. Vérifier d'abord si le système produit un brouillon développé,
puis si les réparations améliorent les passages signalés sans régression. Un arrêt sans promotion n'est pas un succès artistique.
