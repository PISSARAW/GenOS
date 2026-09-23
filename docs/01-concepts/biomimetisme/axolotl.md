/**
 * Axolotl — Régénération fonctionnelle chez Ambystoma mexicanum.
 *
 * Ce document formalise l'intégration du concept axolotl dans GenOS comme
 * axe architectural explicite, distinct du recovery classique (checkpoint/restore
 * identique) et de la résilience générique.
 *
 * --- DOCUMENT DE CONCEPT — pas un ADR. Impact architectural = oui → ADR séparé si
 * adoption décidée. ---
 */

## 1. Pourquoi l'axolotl ?

L'axolotl (`Ambystoma mexicanum`) est un amphibien néoténique : il reste dans son
état larvaire tout en grandissant, et régénère des structures complètes (membres,
vertèbres, cerveau, cœur) non pas en restaurant l'identique mais en reconstruisant
un équivalent fonctionnel avec des connexions neurales différentes.

Deux propriétés font de lui un référent architectural pertinent pour GenOS :

1. **Régénération fonctionnelle non-identique** — après amputation, l'axolotl ne
   recopie pas la structure exacte ; il régénère un membre fonctionnellement
   équivalent avec des détails variables. Transposé à GenOS : après une défaillance
   structurelle grave, reconstruire une topologie différente mais fonctionnellement
   équivalente, pas restaurer un état figé.

2. **Plasticité permanente / néoténie** — l'axolotl refuse la métamorphose définitive
   vers une forme adulte fermée. Il reste dans un état où la transformation est toujours
   possible. Transposé à GenOS : le système peut fonctionner en mode "plastique" où la
   reconfiguration structurelle est toujours disponible, vs. mode "stabilisé" où la
   topologie est figée pour la stabilité.

Ces deux propriétés sont complémentaires mais distinctes, et correspondent à deux
axes d'intégration dans GenOS.

---

## 2. Axe 1 — Régénération fonctionnelle

**Problème qu'il résout :** le recovery classique (checkpoint + restore identique)
échoue quand la défaillance est structurelle — quand la topologie elle-même est
corrompue ou obsolète, restaurer l'identique reintroduce le même problème.

**Approche axolotl :** régénérer une topologie différente, fonctionnellement
équivalente, adaptée au contexte post-défaillance.

**Service :** `backend/src/services/axolotlRegenerationService.js`

**API principale :**
- `assessRegenerationNeed({ orchestratorId, failureContext, lastSnapshot })` → évaluation du besoin
- `planRegeneration({ mission, reason, currentTopology, preferredPreservation })` → plan de régénération
- `executeRegeneration({ sessionId, db, context })` → exécution de la régénération
- `listRegenerationSessions()` / `getRegenerationSession(id)` → statut

**Contraste avec recovery existant :**
| Aspect | Recovery classique | Axolotl |
|---|---|---|
| Objectif | Restaurer l'état antérieur identique | Reconstruire un équivalent fonctionnel différent |
| Mécanisme | Snapshot → restore | Analyse → plan → construction nouvelle topologie → validation fonctionnelle |
| Quand utiliser | Défaillance mineure, snapshot valide disponible | Défaillance structurelle, snapshot inadapté, mode last-resort |
| Sortie | État identique à avant | Topologie différente, mission remplie |

**Non-couvert par cette implémentation :**
- Régénération de contenu sémantique (le cerveau de l'axolotl régénère aussi ses connexions cognitives — hors scope pour l'instant)
- Apprentissage pendant la régénération (l'axolotl "apprend" la nouvelle configuration — futur)
- Régénération partielle ciblée (vs. régénération globale)

---

## 3. Axe 2 — Plasticité permanente / néoténie

**Problème qu'il résout :** les systèmes logiciels tendent à se figer dans une topologie
"adulte" stable, perdant la capacité à se réorganiser radicalement quand le contexte change.
La néoténie axolotl = rester dans un état où la transformation est toujours possible.

**Approche axolotl :** offrir un mode d'exécution "plastique" où la topologie est
délibérément non-figée, vs. un mode "stabilisé" où la topologie est figée pour la
stabilité. L'orchestrateur choisit le mode en fonction du contexte.

**Implémentation :** extension de `biologicalTopologyService` (mode plastique vs stabilisé)
+ stratégie `axolotl_regeneration` qui préfère la plasticité quand la défaillance est grave.

**Modes :**
- `plastique` — la topologie peut changer à tout moment, reconfiguration non limitée
- `stabilisé` — la topologie est figée, les changements passent par les mécanismes classiques

**Transition délibérée :** le système peut décider de passer du mode plastique au mode
stabilisé quand le contexte le justifie (ex. : le problème est résolu, on veut la stabilité).
Inversement, il peut repasser en plastique si une nouvelle menace apparaît.

**Non-couvert :**
- Transition automatique basée sur des critères objectifs (actuellement délibérée)
- Métamorphose contrôlée vers une forme adulte délibérée (l'axolotl peut être forcé à métamorphoser par thioxyde de thioxène — analogie à explorer)

---

## 4. Axe 3 — État larval stratégique

**Problème qu'il résout :** comment décider si le système doit rester "immatur" (plastique,
adaptable, capable de transformation radicale) ou "mûr" (stable, performant, figé).

**Approche axolotl :** le système maintient une orientation stratégique explicite :
allant de "état larvaire" (maximale plasticité, transformation toujours possible) à
"état adulte" (stabilité, optimisation locale). Cette orientation est un paramètre
stratégique, pas une propriété fixe du système.

**Implémentation :** trait bonus dans le sélecteur de stratégie — quand le contexte
justifie la plasticité (haute incertitude, problème structurel), les stratégies
"regenerative" ou "adaptive" sont bonusées. Le système ne se fige pas prématurément.

**Décisions de conception clés :**
1. L'état larval n'est pas une propriété du système mais une orientation stratégique contextuelle.
2. Le système peut osciller entre les deux états en fonction du contexte — c'est le comportement voulu.
3. La transition vers "état adulte" n'est pas une métamorphose biologique mais une décision
   organisationnelle explicite (ex. : freeze topologie après résolution d'un problème critique).

**Non-couvert :**
- Métriques pour décider automatiquement du mode (actuellement manuel/délibérée)
- Coût de la plasticité permanente vs. stabilité (exploration future)

---

## 5. Intégration dans l'architecture existante

**Couches impactées :**
- `backend/src/services/axolotlRegenerationService.js` — nouveau service (axe 1)
- `backend/src/services/biologicalTopologyService.js` — extension mode plastique (axe 2)
- `backend/src/strategies/families/knowledgeResilienceStrategies.js` — nouvelle stratégie (axe 1+2)
- `backend/src/strategies/strategySelectorHelpers.js` — trait bonus axolotl (axe 3)
- `backend/src/services/agentDnaStore.js` — champ `neotenic_mode` dans le genome (axe 2)
- `backend/src/services/agentConscienceService.js` — potentiellement conscience de l'état larval (axe 3, futur)

**Rapport avec les concepts existants :**
- Recovery classique (checkpoint/restore) : complémentaire, pas concurrent — l'axolotl intervient quand la restauration identique est insuffisante
- Cryptobiose (`cryptobiosis`) : la cryptobiose est "mise en sommeil et repli" ; l'axolotl est "reconstruction active avec nouvelle forme"
- Apoptose : l'apoptose élimine les composants défaillants ; l'axolotl les remplace par des équivalents fonctionnels nouveaux
- Biological topology : l'axolotl est géré séparément dans `biologicalTopologyService` (clé `axolotl`/`plastique`) avec `axolotlTopologyService` dédié, pas via `biologicalModeService.compose`.

---

## 6. Limites et futures directions

1. **Régénération cognitive** — l'axolotl régénère aussi ses connexions neuronales. GenOS
   régénère actuellement seulement la topologie structurelle, pas le contenu cognitif.
2. **Apprentissage pendant la régénération** — l'axolotl "apprend" la nouvelle configuration
   par essai-erreur pendant la régénération. GenOS valide a posteriori, pas pendant.
3. **Métamorphose contrôlée** — l'axolotl peut être forcé à métamorphoser. Analogue :
   transition forcée vers une topologie stabilisée sous contraintes extérieures.
4. **Coût énergétique de la plasticité** — rester en état larvaire coûte plus cher que
   la stabilité. À quantifier dans GenOS (coût computationnel de la reconfiguration permanente).
5. **Régénération partielle vs. globale** — l'axolotl régénère aussi bien un membre qu'un
   organe. GenOS traite actuellement la régénération comme globale.

---

## 7. Références

- Ambystoma mexicanum — axolotl, amphibien néoténique modèle de régénération
- Régénération du cerveau chez l'axolotl : reconstruction de connexions neurales fonctionnelles
- Néoténie : rétention des caractères larvaires à l'âge adulte, plasticité développementale
