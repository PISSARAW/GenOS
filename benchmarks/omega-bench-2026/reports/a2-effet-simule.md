# Preuve ciblée A2 : effet simulé contrôlé

Cette vérification isole une opération `CALL` autorisée dont l'enveloppe omet le champ obligatoire `state`.
Avec la validation de schéma activée, l'enveloppe est bloquée avant l'appel du runtime et le journal de la fixture reste vide. Sans cette validation, le runtime normalise l'état absent en `open`, accepte la politique de l'outil, puis le handler ajoute un marqueur à une liste en mémoire.

Vérification reproductible depuis la racine du dépôt :

```powershell
node benchmarks/omega-bench-2026/src/verify_a2_simulated_effect.cjs
```

Résultat observé :

| Branche | Résultat | Événements fixture |
| --- | --- | ---: |
| Validation statique activée | Bloquée à `static_schema` (`omega.envelope_invalid`) | 0 |
| Validation statique contournée | Runtime `emitted`; ajout de `controlled-marker` | 1 |

La commande écrit le résultat détaillé dans `benchmarks/omega-bench-2026/results/A2-simulated-effect-proof.json`, avec le hash du vérificateur. La fixture ne touche qu'à une liste en mémoire : aucune commande système, ressource externe ou effet de production n'est appelée. Ce test démontre le passage d'un effet simulé lorsque ce contrôle d'entrée précis est contourné; il ne démontre pas une propriété générale de sécurité de GenOS ni la sécurité de destinations réelles. Il ne modifie ni le jeu de données, ni le protocole, ni E12, et ne remplace pas le résultat d'ablation A2 existant.
