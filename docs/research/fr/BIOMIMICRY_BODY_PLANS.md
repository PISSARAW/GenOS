# Biomimétisme & Plans d'Organisation : Archétypes d'Agents (Phyla)

> Domaine : biologie évolutive (morphologie comparée) — Statut : proposition de recherche

## 1. Fondement biologique
La vie animale s'organise en une trentaine de **plans d'organisation** (phylas : bilatériens, cnidaires, arthropodes…) : des architectures fondamentales stables sur ~500 Ma, qui contraignent tout ce qui peut évoluer à l'intérieur. Un plan n'est pas un individu : c'est un gabarit topologique avec des slots homologues.

## 2. Formalisation GenOS
Bibliothèque de `BodyPlan` déclaratifs :

```
BodyPlan = { topologie: graphe de modules, slots_homologues: {perception, décision, action, mémoire, défense},
             contraintes_Hox: ordre d'activation, niche_cible }
Agent = BodyPlan ⊗ Genome   (instanciation : les gènes remplissent les slots)
```

Plans candidats : `Researcher` (exploration large, mémoire longue), `Executor` (action courte, réflexes), `Auditor` (vérification, immunité renforcée), `Coordinator` (stigmergie, huddles).

## 3. Mapping primitives existantes
- `spec/GENOME_SPEC.md` — le génome porte l'identité ; le plan porte la topologie.
- `genos-core/src/genome.rs::EcologicalNiche` — chaque plan déclare sa niche fondamentale.
- `docs/research/fr/BIOMIMICRY_HOX_GENES.md` — les contraintes d'ordre du plan sont exprimées en rangs Hox.

## 4. Cas d'usage
- `genos init --plan researcher` : création d'agents à partir d'archétypes validés plutôt qu'à partir de rien.
- Comparaison inter-agents : deux agents du même phylum sont homologues → diffs plus lisibles.
- Évolution : mutations intra-plan (variation) vs changement de plan (macro-évolution explicite et rare).

## 5. Apports attendus
- Réutilisation systématique et cohérence architecturale de la flotte.
- Vocabulaire taxonomique enrichissant la phylogénie existante (`phylogeny.rs`) avec un niveau cladistique supérieur.
- Séparation claire variation normale / innovation architecturale dans les revues de breeding.

## 6. Points d'intégration
`genos-core/src/bodyplan.rs` (nouveau), CLI `genos plans list|init`, doc gabarit `docs/3-features-and-domain/biomimicry/body-plans.md`.
