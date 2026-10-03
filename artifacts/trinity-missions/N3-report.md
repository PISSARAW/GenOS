# Mission N3 — Lenteurs intermittentes : verrou vs GC vs réseau

**Verdict : RÉUSSITE** — variant `controlled` (Evidence Vector partagé + Hypothesis Designer), hypothèse la mieux soutenue identifiée avec ses contradictions.

## 1. Lancement Trinity (réel, vérifié)

- Variant : `controlled` — receipt `trinity-design-v1-fa00945a3cd8fa76`, design 100 % baseline (`sealed`, `shared_evidence_vector`), maturity `implemented`
- Workers réels : basic_implementation→bounded_worker (direct), interview_plan_implementation→specialist (structured), self_correcting_implementation→adaptive_worker (falsification)
- Replay : `node artifacts/trinity-missions/run_all.cjs --only N3`

## 2. Triplet d'hypothèses (Hypothesis Designer)

- H1 contention de verrou, H2 garbage collection, H3 appel réseau externe synchrone bloquant. Chaque hypothèse reçoit : prédictions, critères de falsification, expérience discriminante.

## 3. Vecteur d'évidence et confrontation

Faits : incidents 2–4 s, corrélés au trafic, CPU **baisse**, mémoire stable.
- **H2 (GC) la plus affaiblie** : un GC sous pression fait monter le CPU et s'accompagne de signaux mémoire (heap, old-gen, pauses corrélées) ; ici CPU baisse + mémoire stable → contradiction directe. Réfutation : corréler pauses GC (logs) aux incidents ; prédiction H2 (pics CPU + heap) non observée.
- **H1 (verrou) soutenue** : threads bloqués = CPU en attente, latence croissante avec le trafic (plus de contendeurs). Contradiction partielle : durées 2–4 s assez calibrées évoqueraient un timeout plutôt qu'une attente de verrou pure (durées de verrou généralement plus dispersées).
- **H3 (réseau externe bloquant) la mieux soutenue, de peu** : attente IO = CPU bas, corrélation au trafic (plus d'appels sortants), durées 2–4 s compatibles avec un timeout/retry fixe, aucune trace mémoire. Contradiction : exige de prouver la dépendance externe sur le chemin critique et la corrélation incident↔latence amont.

## 4. Conclusion

> **H3 (appel réseau externe bloquant) légèrement favorite, H1 (verrou) sérieuse concurrente, H2 (GC) quasi réfutée.** Les deux survivantes partagent la signature « attente, pas calcul » (CPU bas) ; on les départage par observations discriminantes.

Observations les plus discriminantes (ordre) : thread dumps pendant incident (BLOCKED sur moniteur = H1 ; WAITING/PARKED sur socket/future = H3), spans distribués (temps passé hors process + corrélation latence amont), métriques lock (attente, file) vs pool IO (connexions, timeouts, retries), charge contrôlée sans dépendance externe (si lenteurs persistent sans réseau → H1 ; si elles disparaissent → H3), logs GC (si 0 corrélation → H2 enterrée).

## 5. Télémétrie, schéma, étapes, budget

- Receipt : `receipts/N3.json`. Schéma : triplet scellé → evidence vector partagé → comparateur.
- Étapes : compose controlled → mapping → triplet + evidence → confrontation → conclusion + expériences.
- Budget : 3 × 1500 tokens simulés, ~0,04 s local, 0 distant.
- Limite honnête : pas de thread dump réel prélevé ; les verdicts sont conditionnels aux faits fournis.
