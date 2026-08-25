# Biomimétisme & Thigmonastie : Réflexes Moteurs Ultra-Rapides

> Domaine : physiologie végétale (mimosa pudica, dionée) — Statut : proposition de recherche

## 1. Fondement biologique
Le mimosa replie ses folioles en < 1 seconde au contact ; la dionée referme son piège après deux stimulations en 20 ms. Ces mouvements **nastiques** (indépendants de la direction du stimulus, contrairement aux tropismes) reposent sur des impulsions électriques pré-câblées et des changements de turgescence — pas sur une croissance ni une décision. C'est la vitesse animale chez les plantes : réponse stéréotypée, instantanée, coûteuse mais brève.

## 2. Formalisation GenOS
```
Thigmonastie(C, stimulus tactile t) :
  Pré-câblé : table {pattern_t → action_rapide} résidant hors pipeline cognitif (registre réflexe signé)
  Latence cible < ε ms ; action bornée {fermer canal, geler écritures, couper session, basculer honeypot}
  Compteur de seuil (comme la Dionée : 2 poils en 20 s) : évite les déclenchements sur bruit isolé
  Coût : chaque déclenchement facturé (turgescence = budget dédié limité) ; récupération programmée
```

## 3. Mapping primitives existantes
- Arc réflexe (`reflex_gate.rs`) — famille proche ; la thigmonastie en est le sous-ensemble ultra-latence défensif.
- Interférons/découplage gap-junction — actions candidates.
- Budgets — enveloppe « turgescence » dédiée.

## 4. Cas d'usage
- Pattern d'injection détecté dans un flux → coupure de session en millisecondes, analyse ensuite.
- Double condition anti-faux-positifs (deux signaux rapprochés exigés).

## 5. Apports attendus
- Défense en millisecondes indépendante de tout raisonnement (fonctionne même si le pipeline cognitif est saturé/compromis).
- Stéréotypie = comportement testable unitairement (déterministe).
- Budget plafonné empêchant les fermetures en cascade incontrôlées.

## 6. Points d'intégration
Extension du registre réflexe (`genos-eval/src/reflex_gate.rs`), profil `thigmonastic` prioritaire latence.
