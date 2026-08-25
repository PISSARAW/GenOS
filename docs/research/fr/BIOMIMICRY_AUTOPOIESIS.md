# Biomimétisme & Autopoïèse : Critère Formel de Viabilité Autonome

> Domaine : biologie théorique (Maturana & Varela) — Statut : proposition de recherche

## 1. Fondement biologique
Un système vivant est **autopoïétique** : il produit continuellement les composants qui produisent le réseau qui les produit, en maintenant sa propre frontière. Ce n'est pas l'énergie, ni la reproduction qui définissent la vie — c'est cette boucle d'auto-production close spatialement et ouverte thermodynamiquement. Un système autopoïétique peut être perturbé ; s'il cesse de s'auto-produire, il ne « récupère » pas : il est mort.

## 2. Formalisation GenOS
```
TestAutopoïese(C) :
  Boucle fermée : ∀ composant k ∈ C, k a été (re)produit par un processus appartenant à C
                  (pas d'éléments « apparus par magie » hors chaîne causale — vérifiable sur le DAG)
  Frontière maintenue : les mécanismes de bordure {BHE, isolation monde, identité signée} sont eux-mêmes
                        produits/maintenus par C
  Viabilité : si la boucle se coupe T > T_mort ⇒ état terminal explicite (pas de reprise spontanée fantôme)
Usage : critère formel pour déclarer une capsule « vivante », « suspendue » ou « morte » — aujourd'hui implicite
```

## 3. Mapping primitives existantes
- DAG causal (`genos-store`) — preuve exhaustive de la boucle de production.
- Frontières (`genos-world`, BHE doc sœur) — objet du maintien.
- Cycle vital/checkpoints — les processus d'auto-maintenance.

## 4. Cas d'usage
- Certification formelle qu'un agent autonome de longue durée s'auto-entretient réellement (et n'est pas maintenu de l'extérieur sans le savoir).
- Déclaration rigoureuse des états terminaux (fin du droit à la reprise automatique).

## 5. Apports attendus
- Définition opérationnelle et testable de « vivant computationnel » — alignée avec la vision produit (« computational organisms »).
- Distinction nette agent autonome / processus hébergé.
- Fondement théorique unifiant budget (flux), frontière (isolation) et auto-production (DAG).

## 6. Points d'intégration
`genos-core/src/autopoiesis.rs` (vérificateur), section « viabilité » dans `spec/GENOME_SPEC.md`.
