# ADR 0186 — Signaux sensoriels animaux typés comme synthétiques

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Décideurs** : Runtime GenOS

## Contexte

Les calculs de magnétoréception et d'électroréception existent, mais des vecteurs
passés directement à ces fonctions ne prouvent pas qu'ils viennent d'un capteur.
Le runtime doit pouvoir les exercer sans présenter des valeurs de démonstration
comme des observations du monde.

## Décision

Le runtime accepte un type `SyntheticAnimalSignal` discriminé par capteur,
valide les dimensions, la finitude et la taille des échantillons, puis appelle
les calculateurs sensoriels existants. Il conserve un événement versionné avec
`origin: synthetic` et la mesure retournée. Les entrées synthétiques ne sont
pas considérées comme des observations réelles ni comme des preuves de
navigation physique.

## Conséquences

- Une intégration hôte future peut introduire une variante d'origine adapter
  sans confondre ses preuves avec les signaux synthétiques.
- Les entrées hors limites ou non finies sont refusées avant l'appel sensoriel.
- Les événements sont conservés dans l'event store runtime courant; la
  persistance après redémarrage reste à valider.

## Preuve

- `crates/genos-orchestrator/src/animal_sensory_runtime.rs`
- Test `synthetic_electrosense_is_measured_and_recorded_with_origin`
- Test `invalid_synthetic_signal_is_rejected_before_runtime_mutation`
