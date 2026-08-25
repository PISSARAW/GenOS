# Biomimétisme & Homéorrhésie : Stabilité de Trajectoire plutôt que Point Fixe

> Domaine : biologie théorique du développement (Waddington) — Statut : proposition de recherche

## 1. Fondement biologique
Le développement embryonnaire ne maintient pas un état constant (ce serait l'homéostasie) mais une **trajectoire** vers l'adulte malgré les perturbations — Waddington parle d'homéorrhésie (« flux stable »). La cible n'est pas un point mais un chemin attracteur : on corrige le cap, pas la position.

## 2. Formalisation GenOS
```
Homéorrhésie(mission M) :
  Trajectoire cible = plan versionné {jalons J_1..J_n} attaché à la mission
  Contrôle : à chaque checkpoint, mesurer l'écart latéral au plan (dérapage) et l'avancement longitudinal
  Correction : agir sur le cap (réallocation tropique, forks ciblés) — tolérer les écarts transitoires,
               interdire les déviations cumulées > θ
Différence avec homéostasie/AMPK existants : ceux-ci stabilisent des variables (charge, énergie) ;
  l'homéorrhésie stabilise un CHEMIN (mission longue à travers environnements changeants)
```

## 3. Mapping primitives existantes
- Checkpoints du cycle vital (doc sœur) — points de mesure.
- Tropismes — moteur de correction douce du cap.
- Event sourcing — reconstruction continue de la trajectoire réelle.

## 4. Cas d'usage
- Mission de refactoring sur plusieurs semaines : détecter précocement le dérapage de périmètre (scope creep) comme écart latéral au plan.
- Flotte migratoire : garder le cap stratégique malgré les perturbations tactiques quotidiennes.

## 5. Apports attendus
- Résilience directionnelle : le bon indicateur n'est pas « l'état est-il stable ? » mais « le cap est-il tenu ? ».
- Métrique de dérapage précoce (latéral vs longitudinal) inédite dans le pilotage actuel.
- Complète la famille régulatoire : AMPK (état), allostasie (anticipation), homéorrhésie (trajectoire).

## 6. Points d'intégration
Couche mission dans `genos-runtime`, extension checkpoints avec mesures latérales.
