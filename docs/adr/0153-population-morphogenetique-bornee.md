# ADR 0153 — Population morphogénétique bornée

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Morphogenèse, populations de variants, provenance
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/morphogeneticPopulationService.js` (`generatePopulation`, `validateProvenance`)
  - Tests : `../../backend/tests/test_morphogenetic_population.js`

## Contexte

La génération de variants morphogénétiques pouvait dépasser toute borne et produire des candidates sans opérateur ni provenance rattachés à leur signal parent.

## Décision

Les signaux produisent des variantes candidates avec opérateur et provenance (`signalId`, opérateur, horodatage). La taille est bornée avant génération (limite 1–32, défaut 8 ; signaux surnuméraires tronqués, `bounded` signalé) ; chaque variante reste liée à son signal parent et porte le statut `candidate`, sans promotion par ce service — les gates ultérieurs seuls promeuvent.

## Conséquences

- Positives : population bornée et traçable, provenance validable (`validateProvenance`), aucune promotion implicite.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; opérateurs par défaut (`clone`, `mutate`) et borne 32 conventionnels.
- Neutres : la troncature signale `bounded` sans lever d'erreur.

## Alternatives

- **Génération non bornée** : rejetée — explosion combinatoire sans garde.
- **Variante sans provenance** : rejetée — impossible à rattacher à son signal parent.
