# ADR 0474 — Invariants d'homéostasie liés aux reçus Rust de division

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Biologie computationnelle, preuves, contrats de complétion.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0324, registres d'exécution Rust et worker Node distincts.

## Contexte

Les reçus Rust biologiques sont conservés dans le même journal de provenance
que les reçus de workers, mais ils ne prouvent pas l'exécution d'un worker. La
politique d'homéostasie doit garder cette séparation tout en permettant à un
contrat explicite de vérifier un effet biologique Rust précis. Jusqu'ici, le
catalogue de vérificateurs ne pouvait exprimer ni cette vérification ni sa
liaison à un reçu durable exact. Les reçus sans origine connue étaient aussi
présentés comme provenant du runtime Rust.

## Décision

Ajouter le vérificateur déclaratif structural
`rust.cell_division_completed`, lié à l'UUID exact d'un reçu. Il accepte
uniquement les reçus de division enregistrés par le chemin local du CLI Rust,
avec origine `genos-rust-cli`, mission Rust reliée à la mission backend,
empreinte et colonnes cohérentes, opération `cell_division`, état achevé et
lignée complète. La ligne SQLite est immuable. Une origine locale et une base
immuable constituent la frontière de confiance de ce flux ; ce vérificateur
n'affirme pas disposer d'une attestation cryptographique indépendante.

Le contexte d'évaluation écrase toujours les marqueurs de reçu Rust fournis
par l'appelant et ne transmet que l'ensemble dérivé des lignes vérifiées. Les
références sans origine locale ou signature enregistrée sont classées
`unattributed-biological-receipt`; elles restent traçables mais ne satisfont
aucun invariant Rust. La décision `execution.satisfied` demeure exclusivement
fondée sur les reçus worker Node, et les reçus Rust restent inclus dans
l'epoch de clôture.

## Alternatives

- Assimiler un reçu Rust à une preuve de worker : rejeté, les registres et les
  résultats ne sont pas équivalents.
- Ajouter un `requiredEvidence` générique comme `rust_receipt` : rejeté, le
  contexte d'appelant pourrait fournir ce marqueur.
- Accepter n'importe quel reçu biologique par mission : rejeté, le contrat
  doit nommer un reçu exact et un type structural précis.
- Revendiquer une signature cryptographique pour le CLI local : rejeté, cette
  propriété n'existe pas dans le protocole actuel.

## Conséquences

- Un contrat durable peut constater une division Rust précise sans promouvoir
  un worker ni conclure à la réussite fonctionnelle de mission.
- Les tests couvrent le rechargement déclaratif, l'origine invalide, le
  marqueur forgé du contexte et le reçu CLI correct.
- Les reçus importés sans provenance explicite gardent leur empreinte et leur
  traçabilité, sans attribution erronée au runtime Rust.
- Une attestation indépendante nécessitera un protocole signé et sa
  vérification au moment de l'ingestion.
