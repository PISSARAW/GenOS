# ADR 0735 — Modèle mental social sourcé

## Statut

Accepté — implémentation incrémentale et descriptive.

## Contexte

SocialWorld établit des capacités relationnelles, de mémoire et de communication.
Ces résultats ne montrent pas encore qu'un agent reconstruit sa relation à partir
d'expériences, représente les limites de ce qu'il sait d'autrui, puis réutilise
cette représentation dans une décision ultérieure. Le service `socialCognitionService`
reste une analyse descriptive et ne doit pas être transformé en moteur qui affirme
des états mentaux comme des faits.

## Décision

Définir `social-mental-model/v1` comme une projection orientée par sujet, fondée sur
des références de souvenirs, avec hypothèses de relation, confiance bornée,
éléments contradictoires, croyances attribuées à autrui et inconnues explicites.
Les états sociaux demeurent des croyances fonctionnelles, contestables et
révisables. Ils ne représentent pas une expérience subjective.

Les projections sociales ne créent aucune permission, autorité, vérité ou droit de
promotion. Une décision sociale ne peut élargir les capacités de l'agent et reste
soumise aux contrôles d'autorité, consentement, confidentialité et budget existants.

La preuve expérimentale doit provenir des événements, souvenirs persistés, reçus
et décisions observées. Les réponses rédigées par un LLM ne sont pas un oracle.
L'effet causal est mesuré par ablation ou modification contrôlée des seuls souvenirs
sociaux, avec les autres entrées et budgets appariés.

## Conséquences

- Une relation reconstruite doit pouvoir être auditée jusqu'aux souvenirs qui la soutiennent.
- Les désaccords, inconnues et hypothèses concurrentes restent visibles.
- Le protocole SocialWorld ajoute un scénario de métacognition relationnelle sans
  requalifier les résultats V1 ou les scénarios V2 non exécutés.
- Aucune conclusion sur la conscience subjective n'est permise par ces mesures.

## Validation attendue

Tests de contrat et de provenance, persistance après redémarrage, reconstruction
différée, réutilisation dans un contexte inédit, puis comparaison causale avec
souvenirs sociaux masqués ou modifiés. Les contrôles négatifs doivent échouer et
tout manque de preuve doit rester `inconclusive`.
