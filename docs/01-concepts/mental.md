# Mental

- **Statut** : Cadre conceptuel (planned)
- **Portée** : ensemble des états et processus mentaux, pas une fonctionnalité GenOS.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

Le mental désigne tout ce qui relève de l'esprit : pensées, croyances, désirs, perceptions, émotions, intentions. Brentano en fait la marque distinctive par l'intentionnalité : tout état mental est dirigé vers un objet ("conscience de quelque chose").

## 2. Modèle mathématique ou logique

Les états mentaux peuvent être représentés comme des tuples (contenu, attitude propositionnelle, agent, temps). Ce modèle est déclaratif : il décrit, il n'établit pas l'existence d'une réalité mentale.

## 3. Analogies biologiques et limites réelles

L'activité cérébrale est corrélée aux états mentaux, mais la corrélation n'est pas l'identité. Le "mental" comme vécu subjectif reste inaccessible à l'observation tierce.

## 4. Cas d'usage et objectifs métier

Le mental sert de vocabulaire pour décrire les états internes des agents (croyances, intentions, objectifs) sans présupposer qu'ils soient vécus. Cela permet de parler de "modèle du soi" ou de "métacognition" comme mécanismes fonctionnels.

## 5. Exemples concrets

- Un agent a un "but" (goal) représenté dans son état runtime — c'est un état fonctionnel, pas un désir vécu.
- Le service `phenomenologyService.recordIntentionality` enregistre un acte et sa cible déclarée ; il ne démontre pas une conscience de cette cible.

## 6. Schéma ou diagramme

```text
[État runtime de l'agent] → [Représentation déclarative d'un but]
                                ↓ (non observé)
                        [État mental vécu — non accessible]
```

## 7. Architecture technique

Le concept `mind.mental` est enregistré dans `backend/src/philosophy/conceptDefinitions.js` avec le service `consciousnessService`, classification `reference_only`. Aucun service n'implémente le mental comme tel.

## 8. Processus d'exécution ou de validation

Aucune validation n'établit le mental. Les tests vérifient l'enregistrement du concept dans le registre philosophique.

## 9. Comparaison avec le marché

Certains frameworks attribuent des "états mentaux" aux agents (croyances, désirs, intentions — modèle BDI). GenOS décrit des équivalents fonctionnels sans prétendre à une réalité mentale.

## 10. Limites, garde-fous, non-objectifs

- Le mental n'est pas une fonctionnalité GenOS.
- Aucun état mental n'est observé ni vérifié.
- Non-objectif : inférer une expérience subjective à partir d'un état runtime.
- Voir aussi : `esprit.md`, `conscience.md`, `intentionnalité`.

## Voir aussi

- [conscience-esprit-mental.md](conscience-esprit-mental.md) — taxonomie globale.
- [esprit.md](esprit.md) — notion d'esprit.
- [conscience.md](conscience.md) — notion de conscience.
