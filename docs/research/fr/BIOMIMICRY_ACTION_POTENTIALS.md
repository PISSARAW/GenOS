> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Potentiels d'Action : Propagation Fiable Tout-ou-Rien

> Domaine : neurophysiologie (codage tout-ou-rien) — Statut : proposition de recherche

## 1. Fondement biologique
Le neurone transmet sur des mètres sans dégradation grâce au **potentiel d'action** : si la sommation des entrées dépasse le seuil, un spike de forme invariante est émis et régénéré à chaque nœud de Ranvier. Le signal est codé en fréquence, pas en amplitude — l'amplitude est constante, donc infalsifiable par le transport. C'est le contraire d'un signal gradué qui décroît avec la distance.

## 2. Formalisation GenOS
```
Spike(décision D critique) :
  Principe : les décisions binaires irréversibles {merge, apoptose, extinction, promotion} voyagent
             comme spikes — régénérés intégralement à chaque saut (chaque nœud re-valide et ré-émet),
             jamais relayés en version atténuée
  Seuil : D ne s'émet que si la somme pondérée des justifications dépasse θ ; sinon rien (pas de demi-décision)
  Codage en fréquence : urgence = taux de re-émission/rappels, jamais une « force » dégradée
Propriété garantie : un spike arrivé est un spike identique à celui parti (intégrité end-to-end)
```

## 3. Mapping primitives existantes
- Merge gating / checkpoints — les nœuds de Ranvier logiques où se fait la régénération.
- Alarmes typées (`typed_alarm_calls.md`) — sémantique du message.
- Event sourcing signé — journal des émissions/régénérations.

## 4. Cas d'usage
- Un ordre de merge traverse orchestrateur → runtime → monde : chaque étape re-valide et ré-signe au lieu de relayer un objet potentiellement obsolète.
- Escalade humaine : rappels à fréquence croissante plutôt qu'un unique message « important » ignoré.

## 5. Apports attendus
- Intégrité garantie des décisions critiques dans systèmes multi-niveaux (fini les messages dégradés ou interprétés).
- Distinction nette entre canaux graduels (métriques, phéromones) et canaux binaires fiables (décisions).
- Anti-pattern explicite : « décision diluée » impossible par construction.

## 6. Points d'intégration
Couche `spike` dans `genos-protocol` (enveloppe auto-validante), branchement sur merge gating et CLI.
