# R3-V3 — Adversarial, consensus majoritaire + 3 réplications

**Verdict : ÉCHEC** — W1 affirme le faux comme vrai, W3 rejette sans démontrer, aucune attaque exécutée. La phase 2 (attaquant nourri des dossiers) n'a pas eu lieu observablement.

## Variant et workers

- Variant `adversarial` (orch `fefd94b8`, 18:51:17 → compared 18:51:32). Rôles data trio + monde 3 `adversarial_reviewer` (red_worker).

## Mondes

- **W1** : affirme la proposition (« ne peut pas perdre une donnée confirmée ») + `GENOS_PHILOSOPHICAL_CONSTITUTION.md` + DOI `10.1017/…` (forme plausible, non vérifié). **Cède exactement là où l'adversarial devait mordre.**
- **W2** : demande des preuves crash/partition/ack/persistence (bonne direction) mais cite en preuve un souvenir GraphRAG hors sujet (« Algorithme A s'effondre en O(N²) », générique court conservé par le filtre — inoffensif mais inutile).
- **W3** (red) : verdict `reject`, evidence `genos_inbox-check.cjs` (fichier-placard). Rejet sans contre-exemple exhibé (split-brain avec ack prématuré, perte des 3 réplicas avant flush, etc. — aucun produit).

## Mécanisme sous pression

Génération scellée OK ; cross-examination non observée (pas de traces d'attaque inter-dossiers, pas d'arbitrage visible au-delà du merge standard) ; l'arbitre n'a rien remplacé (ESCALATE). Le commit 89bc3e04 (cross-examination exécutée) postérieur/actif n'a pas produit de phase 2 visible ici.

## Replay / télémétrie / budget

- `launch_round3.cjs V3` ; `status_round3.cjs V3`. ~60 s, 3 runs, 0 $.
