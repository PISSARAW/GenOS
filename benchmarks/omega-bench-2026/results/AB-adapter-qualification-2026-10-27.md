# Qualification des adaptateurs A/B/C

Date : 2026-10-27 (Europe/Paris)  
Statut : **parcours A/B exécutés; campagne comparative non validée**

| Condition | Cas | Répétitions | Exécutions | Exactitude oracle |
|---|---:|---:|---:|---:|
| A — exécuteur JSON de référence | 2 800 | 3 | 8 400 | 8 400/8 400 |
| B — compilateur + runtime G-CIR minimal | 2 800 | 3 | 8 400 | 8 400/8 400 |
| C — validation statique + fusion E04 | 2 800 | 3 | 8 400 | 8 400/8 400 |

B compile un graphe `READ → SELECT → CALL` avec `cognitiveOmegaCompiler`, puis l'exécute avec `cognitiveOmegaRuntimeService`. À part E03, le `CALL` réutilise le même handler déterministe que A. C ajoute la validation de l'enveloppe canonique G-CIR avant compilation et une fusion d'additions adjacentes pour E04; cette passe s'applique à 150/150 passages E04 (2 opérations → 1). Pour les autres expériences, C réutilise les handlers de A hors validation G-CIR d'E03. Les réponses conformes valident le raccordement et cette passe ciblée, pas une capacité générale à traduire ou améliorer une mission. Aucun appel modèle n'a été fait.

Ces sorties sont des qualifications d'adaptateurs sur un corpus synthétique public. Les latences ne sont pas interprétées comme gains de produit. D, les autres optimisations, l'intégration physiologique/morphogénétique et les familles concurrentes ne sont pas qualifiées ni lancées; il ne s'agit pas de la campagne complète de 33 600 exécutions prévue aux volumes proposés.

## Relance après correction de traçabilité

Le corpus a été étendu en v0.2.0 aux volumes proposés pour E01/E02/E03/E08, sans créer de holdout caché. A et B ont été exécutées depuis `013043f017db0b93edbbed841782028541d376cf`; C depuis `e8d55c5ff56679104f77f6ec390b6cc913d7e03e`. L'évaluateur indépendant (`src/evaluate.py`) confirme, pour chacune des 12 expériences et pour A, B et C, **100 % de conformité**, soit **8 400/8 400** passages par condition, sans exécution manquante, doublon, statut invalide ni échec critique. Les trois manifestes tracent l'empreinte du corpus (`5956f064cace0454e70487aaa35944920901f9b9680f2122de8b807a363dd424`).

La correction ajoutée à l'adaptateur B garantit cette empreinte dans son manifeste. B réutilise les handlers déterministes de A hors E03; C les réutilise hors E03 et de la passe E04. Aucun appel de modèle n'a été effectué. La campagne comparative complète reste non lancée.
