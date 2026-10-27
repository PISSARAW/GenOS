# Qualification des adaptateurs A/B

Date : 2026-10-27 (Europe/Paris)  
Statut : **parcours A/B exécutés; campagne comparative non validée**

| Condition | Cas | Répétitions | Exécutions | Exactitude oracle |
|---|---:|---:|---:|---:|
| A — exécuteur JSON de référence | 2 800 | 3 | 8 400 | 8 400/8 400 |
| B — compilateur + runtime G-CIR minimal | 2 800 | 3 | 8 400 | 8 400/8 400 |

B compile un graphe `READ → SELECT → CALL` avec `cognitiveOmegaCompiler`, puis l'exécute avec `cognitiveOmegaRuntimeService`. À part E03, le `CALL` réutilise le même handler déterministe que A. Les réponses identiques valident le raccordement du compilateur/runtime au contrat du résultat, mais ne mesurent pas la capacité de G-CIR à traduire ou améliorer une mission. Aucun appel modèle n'a été fait.

Ces sorties sont des qualifications d'adaptateurs sur un corpus synthétique public. Les latences ne sont pas interprétées comme gains de produit. C, D, les optimisations, l'intégration physiologique/morphogénétique et les familles concurrentes ne sont pas qualifiées ni lancées; il ne s'agit pas de la campagne complète de 33 600 exécutions prévue aux volumes proposés.

## Relance après correction de traçabilité

Le corpus a été étendu en v0.2.0 aux volumes proposés pour E01/E02/E03/E08, sans créer de holdout caché. A et B ont ensuite été relancées depuis la révision `013043f017db0b93edbbed841782028541d376cf`. L'évaluateur indépendant (`src/evaluate.py`) confirme, pour chacune des 12 expériences, **100 % de conformité** dans les deux conditions, soit **8 400/8 400** passages chacune, sans exécution manquante, doublon, statut invalide ni échec critique. Les manifestes enregistrent la même empreinte du manifeste du corpus (`5956f064cace0454e70487aaa35944920901f9b9680f2122de8b807a363dd424`).

La correction ajoutée à l'adaptateur B garantit maintenant cette empreinte dans son manifeste. Le résultat reste une qualification fonctionnelle : B réutilise les handlers déterministes de A hors E03, et aucun appel de modèle n'a été effectué. La campagne comparative complète reste non lancée.
