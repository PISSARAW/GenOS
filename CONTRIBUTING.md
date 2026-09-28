# Contribuer à GenOS

Ce guide complète [AGENTS.md](AGENTS.md) (règles pour les agents de code) et
[docs/CONVENTIONS.md](docs/CONVENTIONS.md) (règles de documentation).
En cas de contradiction, `AGENTS.md` et `.genos.md` priment pour le code.

## Principes

- Une exécution réussie n'est pas une preuve : ne jamais maquiller un succès,
  respecter les gates d'évidence et de promotion.
- Ne jamais committer `.env`, secrets, `*.db` ni artefacts générés
  (déjà couverts par `.gitignore` ; les fichiers locaux restent locaux).
- Tout changement d'architecture exige un ADR dans `docs/adr/`
  (voir `docs/adr/README.md`, section « Ajouter un ADR »).

## Avant de proposer un changement

1. Lire `AGENTS.md` (setup, définition de fini, conventions).
2. Pour la doc : respecter `docs/CONVENTIONS.md` (familles numérotées,
   `kebab-case`, ADR en `NNNN-slug`, liens relatifs, pas de déplacement
   sans migration de provenance — voir ADR 0005).
3. Pour le code : fichiers ≤ 400 lignes, fonctions ≤ 3 paramètres,
   complexité cyclomatique ≤ 10, frontières SOLID.

## Vérifications requises (définition de fini)

```bash
python scripts/ci/check_code_quality.py   # gate baseline : rejette l'augmentation de dette ; --strict pour tout rejeter
npm test
cargo test --workspace
```

## Commits

- Première ligne avec tag majuscule entre crochets : `[FIX]`, `[FEAT]`,
  `[REFACTOR]`, `[DOC]`, … (contrôlé par `.githooks/commit-msg`).
- Ne pas contourner le gate avec des annotations ou commentaires inline.

## Licence

Toute contribution est soumise aux termes de [LICENSE](LICENSE) (Apache 2.0).
