# ADR 0526 — Reproduction reproductible par graine de campagne

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : reproduction simulée, identité des filles, persistance et reprise
- **Lié à** : ADR 0001 — AgentDNA : format héréditaire binaire

## Contexte

La reproduction autonome générait un UUID aléatoire pour le génome fille, puis
utilisait cet UUID pour initialiser le RNG de mutation. Une graine de crossover
ne suffisait donc pas à reproduire une campagne complète. L'état persistant ne
retenait pas de graine de reproduction à vérifier lors d'une reprise.

## Décision

La CLI accepte `--reproduction-seed` avec `--tick`. Quand cette option est
présente, les UUID du génome et de la cellule fille sont dérivés par SHA-256 de
l'identité de mission, de la graine, de la cellule et du génome parent, ainsi
que du nombre de cicatrices de bourgeonnement antérieur. L'UUID du génome fille
continue de déterminer le RNG de mutation. Les identités déterministes sont
validées dans le reçu de lignée.

La graine fait partie du checkpoint, de l'instantané de population, du reçu de
reproduction et du lien hashé vers l'instantané. Une reprise qui demande une
graine incompatible est rejetée avant la restauration de la population ou un
nouveau tick. Une répétition avec la même clé d'idempotence ne réécrit pas le
reçu si son contenu et son instantané liés correspondent; un contenu différent
est traité comme une collision.

Pour une campagne seedée, les cellules actives et les spores sont triées par
identifiant avant la sérialisation du snapshot, afin que l'ordre de parcours des
collections ne change pas son digest.

Sans graine configurée, le chemin historique conserve ses UUID aléatoires et
son comportement non déterministe.

## Conséquences

### Positives

- Deux campagnes initialisées du même état, de la même mission et de la même
  graine produisent les mêmes identités et mutations de reproduction.
- La graine restaurée est liée au reçu et son incompatibilité bloque la reprise
  avant mutation.
- Les reçus historiques sans graine restent lisibles et le chemin legacy garde
  son comportement antérieur.

### Négatives

- L'option CLI et le format persistant évoluent; les lecteurs acceptent l'absence
  de graine pour préserver la compatibilité historique.
- La reproductibilité couvre les transitions de reproduction et leurs reçus;
  elle ne garantit pas l'identité de chaque donnée auxiliaire ou horodatage.
- Cette détermination algorithmique n'établit aucune propriété biologique
  réelle : elle rend une simulation logicielle répétable.

## Vérification

- `crates/genos-orchestrator/tests/reproduction_campaign_seed.rs`
- `crates/genos-cli/tests/biological_ecology_reproduction_campaign.rs`
- Tests Cargo ciblés de l'orchestrateur et de la CLI.

## Alternatives

- Ne semer que le RNG du crossover : rejeté, car l'identité du génome fille
  initialisait le RNG de reproduction.
- Remplacer le comportement legacy par des UUID déterministes : rejeté, car les
  campagnes sans graine doivent conserver le comportement existant.
