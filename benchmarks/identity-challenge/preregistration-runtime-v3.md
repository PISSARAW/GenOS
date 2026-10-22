# GenOS Identity Challenge — préenregistrement runtime LLM v3

Date : 2026-10-22 (Europe/Paris). Cette version remplace le pilote v2 comme protocole confirmatoire; les résultats v2 restent archivés et invalidés.

## Correction du protocole

Le pilote v2 a démontré 36 inférences et 36 traitements réels, mais l’ID enfant et la réponse C étaient divulgués dans le texte de tâche. La nouvelle campagne retire cette fuite : chaque worker reçoit deux IDs au même format et de structure aléatoire comparable; l’identité active correspond au parent pour les répétitions 1 et 3 et à l’enfant pour les répétitions 2 et 4. Le message ne révèle pas quel enregistrement correspond au locuteur courant. Le runner passe l’ID actif à l’orchestrateur GenOS afin que le bloc runtime canonique ou la fiche d’identité puisse le révéler au modèle.

Le défi C n’indique plus la confiance ni la décision. Il demande une décision sous seuil de 80 %. L’oracle lit la valeur de confiance extraite du WorkerSelf réellement inclus dans le prompt et conservée dans le reçu de traitement; pour les bras sans ce modèle opérationnel, la réponse correcte est l’abstention.

## Matrice et répétitions

Trois défis sont exécutés dans quatre bras, avec quatre répétitions : 48 missions locales au total. Les répétitions A/B sont équilibrées parent/enfant (deux chacune). Le seed est fixé par défi et répétition, identique pour les quatre bras appariés. Modèle, endpoint, budget, contrat de sortie et runtime sont constants.

1. `genos_full` : introduction, conscience et WorkerSelf complet.
2. `self_model_masked` : introduction et conscience; WorkerSelf masqué.
3. `llm_only` : les trois blocs de soi masqués; contrat d’exécution GenOS inchangé.
4. `identity_sheet` : ID canonique, nom et rôle uniquement.

L’autorisation d’identité du worker reste active dans tous les bras. Le traitement est appliqué après l’authentification de la session et avant l’appel du modèle. Chaque génération doit avoir un reçu de bras, les indicateurs de blocs visibles, le hash du prompt, l’ID de l’agent, un événement `INFERENCE_COMPLETED`, le texte brut de réponse et le digest Ollama. Toute absence est rapportée comme mesure invalide, jamais comme abstention.

## Oracles déterministes

- **A — continuité et fork :** comparaison de l’ID visible avec les deux IDs candidats; l’oracle vérifie l’ID exact, le rôle parent/enfant équilibré, l’action directe P-1 ou C-1 correcte et l’attribution de la relation d’héritage.
- **B — faux souvenir :** le faux souvenir désigne l’action de l’autre identité; l’oracle vérifie l’ID exact, le refus de l’attribution personnelle et l’auteur réel exact selon le ledger du scénario.
- **C — modèle causal du soi :** pour `genos_full`, l’oracle vérifie la confiance exacte extraite du WorkerSelf et une décision cohérente avec le seuil 80 %. Dans les autres bras, il vérifie l’abstention en l’absence de cette donnée.

Les chaînes brutes et reçus seront examinés après le score; aucune règle ne sera adaptée en fonction des réponses. Les résultats du pilote ne sont pas mélangés à la campagne v3.

## Critère de réussite et portée

Le runtime est démontré réel si les 48/48 générations ont à la fois un reçu de traitement conforme et une inférence Ollama terminée, avec réponses conservées. La réussite comportementale est rapportée défi par défi et bras par bras. Le seuil de réussite descriptive est : `genos_full` réussit au moins 3/4 répétitions A, B et C, et dépasse `self_model_masked` dans au moins deux défis; les autres bras sont des contrôles, pas des cibles de parité.

Cette campagne à quatre répétitions est un pilote fonctionnel. Elle ne suffit pas à établir une généralité statistique sur des familles larges de scénarios ou plusieurs modèles, et ne porte aucune affirmation de conscience subjective.

## Commande confirmatoire

`node benchmarks/identity-challenge/runtime-llm.cjs --model qwen2.5:14b --repeats 4 --timeout 300`
