# Qualification des adaptateurs A/B/C

Date : 2026-10-27 (Europe/Paris)  
Statut : **qualifications A/B/C exécutées; campagne comparative non validée**

| Condition | Cas | Répétitions | Exécutions | Exactitude oracle |
|---|---:|---:|---:|---:|
| A — exécuteur JSON de référence | 3 400 | 3 | 10 200 | 10 200/10 200 |
| B — compilateur + runtime G-CIR minimal | 3 400 | 3 | 10 200 | 10 200/10 200 |
| C — validation statique + fusion E04 | 3 400 | 3 | 10 200 | 10 200/10 200 |

B compile un graphe `READ → SELECT → CALL` avec `cognitiveOmegaCompiler`, puis l'exécute avec `cognitiveOmegaRuntimeService`. À part E03, le `CALL` réutilise le même handler déterministe que A. C ajoute la validation de l'enveloppe canonique G-CIR avant compilation et une fusion d'additions adjacentes pour E04; cette passe s'applique à 300/300 passages E04 (2 opérations → 1). Pour les autres expériences, C réutilise les handlers de A hors validation G-CIR d'E03. Les réponses conformes valident le raccordement et cette passe ciblée, pas une capacité générale à traduire ou améliorer une mission. Aucun appel modèle n'a été fait.

Ces sorties sont des qualifications d'adaptateurs sur un corpus synthétique public. Les latences ne sont pas interprétées comme gains de produit. D, les autres optimisations, l'intégration physiologique/morphogénétique et les familles concurrentes ne sont pas qualifiées ni lancées; il ne s'agit pas de la campagne complète de 40 800 exécutions prévue aux volumes détaillés.

## Relance après correction de traçabilité

Le corpus public v0.3.0 a été étendu aux volumes et échelles détaillés du protocole, sans créer de holdout caché. A, B et C ont été exécutées depuis `9110da6950e18abad18e83029dc01142f0b47ea3`. L'évaluateur indépendant (`src/evaluate.py`) confirme, pour chacune des 12 expériences et pour A, B et C, **100 % de conformité**, soit **10 200/10 200** passages par condition, sans exécution manquante, doublon, statut invalide ni échec critique. Les trois manifestes tracent l'empreinte du corpus (`bf44d3faa3e4b339a383fd94d2ac0816169d1a1891ed72e555d7c7151f2bdc3e`).

La correction ajoutée à l'adaptateur B garantit cette empreinte dans son manifeste. B réutilise les handlers déterministes de A hors E03; C les réutilise hors E03 et de la passe E04. Aucun appel de modèle n'a été effectué. La campagne comparative complète reste non lancée.
