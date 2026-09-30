# Mesures runtime du filtrage choanocyte

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime, flux, cellules spécialisées, mesure
- **Décideurs** : GenOS
- **Lié à** : ADR 0192

## Contexte

La façade exposait le filtrage du choanocyte sans enregistrer les volumes traités,
retenus ou rejetés ni le débit résultant.

## Décision

`GenosEcosystem::filter_stream` conserve le résultat filtré et émet un reçu versionné
avec l'identité du choanocyte, la mission éventuelle, les compteurs, les ratios et le
vecteur de flux calculé. Le contenu des paquets n'est pas recopié dans le reçu.

## Conséquences

### Positives

- Les appels runtime rendent le rendement et les pertes observables.
- Le reçu relie ces mesures à la mission quand un identifiant est fourni.

### Négatives

- L'event store reste en mémoire; aucune validation E2E avec persistance n'est affirmée.
- Les métriques décrivent le modèle de flux local, pas le débit d'un transport réseau.

## Alternatives

- Se limiter au résultat retourné au seul appelant : rejeté, car les mesures ne seraient
  pas corrélables avec les autres événements runtime.
