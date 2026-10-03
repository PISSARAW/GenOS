# Mission N4 — Architectures financières auditables (Pareto, pas de gagnant artificiel)

**Verdict : RÉUSSITE** — variant `pareto`, front de Pareto conservé (2 options non dominées), 3e option dominée et écartée avec justification.

## 1. Lancement Trinity (réel, vérifié)

- Variant : `pareto` — receipt `trinity-design-v1-2e53048a0b50f69d`, `objectivePolicy=pareto_orthogonal`, maturity `implemented`
- Profils d'objectifs orthogonaux assignés par le service Pareto : W1 qualité (correctness/coverage), W2 efficacité (latency/reproducibility/cost), W3 risque (risk/uncertainty/constraintCoverage)
- Workers réels (profil de domaine `security` détecté par les signaux « audit/financier » — comportement documenté, pas un choix manuel) :
| # | Chambre | Rôle | WorkerKind |
|---|---------|------|------------|
| 1 | direct | baseline_security_engineer | bounded_worker |
| 2 | structured | threat_model_engineer | specialist |
| 3 | falsification | adversarial_security_engineer | red_worker |
- Replay : `node artifacts/trinity-missions/run_all.cjs --only N4`

## 2. Mondes indépendants (objectifs orthogonaux)

- **W1 qualité** : 10 000 écritures/s + erreurs très coûteuses → exige ACID/sérialisabilité sur le chemin d'écriture ; audit 10 ans → journal immuable, requêtes temporelles ; craint la complexité distribuée (double-écriture, exactly-once illusoire).
- **W2 efficacité/exploitation** : équipe de 8, exploitation simple → monolithe déployable, schéma unique, backup/restore unique ; 10k w/s soutenus possibles sur un nœud sérieux + réplicas lecture, mais 10 ans d'audit gonflent la base chaude.
- **W3 risque** : erreurs financières = irréversibilité ; toute architecture à cohérence éventuelle sur les écritures est une faute ; l'audit doit être la source de vérité, pas une projection.

## 3. Comparaison multicritère (échelle 1–5, 5 = meilleur)

| Critère | (1) Monolithe + journal d'audit append-only | (2) Microservices + événements | (3) Event sourcing + CQRS |
|---|---|---|---|
| Débit écriture 10k/s | 4 (OK avec tuning, shard si besoin) | 4 (OK, au prix de la cohérence) | 5 (append-only, excellent en écriture) |
| Audit 10 ans | 4 (table append-only + archivage froid) | 2 (événements dispersés, replay partiel) | 5 (le journal EST l'état) |
| Sûreté financière | 5 (ACID) | 2 (éventuelle, compensations) | 5 (invariants + replay) |
| Simplicité d'exploitation | 5 | 2 | 2 |
| Charge équipe de 8 | 5 | 2 | 3 |
| Évolutivité lecture | 3 | 4 | 5 (CQRS) |

Analyse de dominance : (2) est dominé ou égalé partout sauf « évolutivité lecture » où (3) le bat aussi → **(2) dominé, écarté**. (1) gagne simplicité/sûreté court terme ; (3) gagne audit/débit/lecture long terme ; aucun ne domine l'autre → **front de Pareto {(1),(3)} conservé (KEEP_PARETO_SET)**.

## 4. Décision non artificielle

- Si exploitation simple prioritaire et horizon d'audit gérable par archivage : **(1) monolithe transactionnel + table d'audit append-only immuable** (juridiquement opposable, ACID, équipe de 8 à l'aise).
- Si l'audit complet rejouable et 10k/s durables dominent : **(3) ES+CQRS sur le cœur financier uniquement** (pas sur tout le système), avec projections CQRS pour la lecture.
- Rejet explicite du faux gagnant : (2) « microservices avec événements » sans sourcing est le pire choix ici (complexité distribuée + cohérence faible = erreurs coûteuses probables).
- Trajectoire Pareto-honnête : commencer (1) avec journal d'événements append-only bien schématisé → migration vers (3) sans réécriture si l'audit/charge l'exige.

## 5. Télémétrie, schéma, étapes, budget

- Receipt : `receipts/N4.json`. Schéma : 3 mondes scellés à objectifs orthogonaux → comparateur Pareto (hypervolume/dominance) → front {(1),(3)}.
- Étapes : compose pareto → mapping → 3 dossiers → matrice multicritère → test de dominance → front conservé.
- Budget : 3 × 1500 tokens simulés, ~0,04 s local, 0 distant.
- Limite honnête : notes 1–5 expertes, pas mesurées ; à remplacer par benchmarks (pgbench/k6, chaos, restore 10 ans) avant engagement.
