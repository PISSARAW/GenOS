# Arc Réflexe — Fast-Path Cognitif

> **Concept biologique** : Arc réflexe — court-circuit du cerveau. Un stimulus nociceptif ou thermique passe par la moelle épinière pour déclencher une réponse motrice immédiate (ex: retirer sa main du feu).
> **Statut** : implémenté (`genos-core::biomimicry::reflex_arc`)
> **Recherche amont** : `docs/research/fr/BIOMIMICRY_REFLEX_ARC.md`

## 1. Pourquoi

### 1.1 Le problème : Latence cognitive mortelle
L'orchestrateur (LLM + MCTS) est un "cerveau" très puissant mais extrêmement lent. Face à un danger critique (API qui boucle à l'infini en coûtant des milliers de tokens, attaque d'injection détectée en temps réel), attendre 30 secondes que le LLM planifie une réponse est inacceptable.

La biologie possède le "Système 1" (Daniel Kahneman) ou l'arc réflexe : une voie rapide, hardcodée, stupide mais immédiate.

### 1.2 Bénéfices
| Bénéfice | Mécanisme |
|---|---|
| **Survie immédiate** | Court-circuite complètement le LLM. Temps de réponse en millisecondes. |
| **Arrêt des hémorragies** | L'action `Freeze` stoppe immédiatement les IO, empêchant la fuite de budget. |

## 2. Comment

Le `ReflexArc` écoute les stimuli sensoriels (via un agent "Observer" ultra-léger) :
- **Thermal** : Mesure la "chaleur" (rate-limits, CPU, consommation token/seconde).
- **Nociceptive** : Détection d'erreurs pures ou de chaînes d'injection.

Si le seuil est dépassé, une `MotorResponse` est renvoyée :
- `Withdraw` : Abandon de la tâche en cours immédiatement.
- `Freeze` : Paralysie (utile pour stopper un rate-limit sans tuer l'agent).
- `Ignore` : Si le seuil n'est pas atteint, le signal est routé "au cerveau" (le LLM).

## 3. Quand — orchestrateur vs worker

| Acteur | Responsabilité |
|---|---|
| **Worker / Observer** | Évalue l'arc réflexe en boucle locale synchrone sans appeler l'API LLM. Si `Withdraw` ou `Freeze` est retourné, la boucle d'exécution est rompue. |
| **Orchestrateur** | Reçoit l'information *a posteriori* ("J'ai retiré ma main du feu car c'était trop chaud") et peut planifier une nouvelle approche. |

## 4. API

### 4.1 CLI
```bash
# Un pic de chaleur CPU/Rate limit
genos biomimicry bio-feature --feature reflex --action trigger \
  --param stimulus=thermal \
  --param value=120 \
  --param heat_threshold=100
# Sortie: REFLEX TRIGGERED: Freeze. Fast-path executed.

# Un petit bobo (routé au LLM)
genos biomimicry bio-feature --feature reflex --action trigger \
  --param stimulus=nociceptive \
  --param value="minor parsing error" \
  --param pain_threshold=50
# Sortie: Stimulus below threshold. Routing to Planner...
```
