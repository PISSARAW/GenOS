# Canalisation & Paysage de Waddington — Robustesse des Trajectoires

> **Concept biologique** : Canalisation — la propension d'une population à produire le même phénotype indépendamment de la variabilité de son environnement (illustrée par le paysage épigénétique de Waddington).
> **Statut** : implémenté (`genos-core::biomimicry::canalization`)
> **Recherche amont** : `docs/research/fr/BIOMIMICRY_CANALIZATION.md`

## 1. Pourquoi

### 1.1 Le problème : Fragilité des Prompts
Dans un système basé sur des LLMs, une infime variation dans un prompt ou un léger bruit dans le contexte peut mener à des résultats diamétralement opposés. La trajectoire de l'agent n'est pas "robuste".

La biologie utilise la canalisation pour s'assurer que, malgré les perturbations (mutations, température), le développement aboutit à un résultat viable. L'organisme "roule" au fond d'une vallée épigénétique.

### 1.2 Bénéfices
| Bénéfice | Mécanisme |
|---|---|
| **Mesure de robustesse** | Permet de quantifier à quel point un trait ou une compétence est stable face aux perturbations. |
| **Validation avant promotion** | On peut refuser de merger une branche si sa canalisation est trop faible. |

## 2. Comment

Le `WaddingtonLandscape` définit la topologie attendue.
- **Expected Phenotype** : L'état final souhaité (hash d'état).
- **Valley Width** : La tolérance. Si la largeur est de 0.8, au moins 80% des trajectoires perturbées doivent retomber sur le phénotype attendu.

L'orchestrateur simule `N` trajectoires avec un bruit injecté (température du modèle modifiée, contexte altéré), puis passe les hashes résultants au module de canalisation.

## 3. Quand — orchestrateur vs worker

| Acteur | Responsabilité |
|---|---|
| **Orchestrateur** | Joue le rôle du perturbateur. Mène les tests de robustesse (Chaos Engineering) et appelle l'API d'évaluation. |
| **Worker** | S'efforce de corriger de lui-même les déviations mineures au runtime. |

## 4. API

### 4.1 CLI
```bash
genos biomimicry bio-feature --feature canalization --action evaluate \
  --param expected_phenotype=hash_A \
  --param valley_width=0.75 \
  --param trajectory=hash_A \
  --param trajectory=hash_A \
  --param trajectory=hash_B \
  --param trajectory=hash_A
```
(Ici, 3 sur 4 convergent = 0.75. La trajectoire est canalisée).
