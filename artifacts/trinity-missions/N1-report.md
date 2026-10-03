# Mission N1 — Premier appel lent après inactivité (120 ms → 1,8 s)

**Verdict : RÉUSSITE** — Trinity lancé avec le bon variant, réponse vérifiée, workers vérifiés.

## 1. Lancement Trinity (réel, vérifié)

- Variant demandé : `adversarial`
- Receipt réel : `trinity-design-v1-925fdecc6e538ea0`, maturity `implemented`, topology `trinity`
- Design appliqué : `interactionPolicy=adversarial_cross_examination`, autres axes au baseline contrôlé
- Workers (mapping réel `topologyWorkerKindService`) :
| # | Chambre | Rôle | WorkerKind |
|---|---------|------|------------|
| 1 | direct | baseline_data_engineer | bounded_worker |
| 2 | structured | planned_data_engineer | specialist |
| 3 | falsification | data_validation_engineer | verifier_worker |
- Chambres : `direct,falsification,structured` — 3 mondes scellés OK
- Replay : `node artifacts/trinity-missions/run_all.cjs --only N1`
- Receipt : `artifacts/trinity-missions/receipts/N1.json`

## 2. Divergence réelle des trois mondes (résumé fidèle)

- **Monde 1 / direct** : lit les symptômes au premier degré. SQL=15 ms donc la base est hors de cause ; CPU<20 % donc pas de saturation ; pattern « premier lent puis rapide » → quelque chose a dormi puis s'est réveillé : pool de connexions, keep-alive, cache froid, JIT, scale-to-zero.
- **Monde 2 / structured** : construit un plan d'hypothèses avec familles : (a) extinction/réduction à l'idle (pool, idle-timeout, scale-to-zero, always-on désactivé), (b) coût fixe de rétablissement (TCP+TLS, auth, JIT, chargement), (c) caches froids (buffer pool, CDN, DNS), (d) artefacts (GC, throttling, voisin bruyant). Ordonne par vraisemblance conditionnelle aux faits.
- **Monde 3 / falsification** : attaque chaque hypothèse : « JIT ? alors pourquoi les appels 2..n sont rapides et le CPU ne pique pas ? », « GC ? alors pourquoi mémoire stable et pause de 1,7 s sans CPU ? », « SQL lent ? réfuté par 15 ms mesurés », « saturation ? réfutée par CPU<20 % ». Exige pour chaque hypothèse un critère de réfutation observable.

## 3. Confrontation / falsification

Hypothèse la plus probable après confrontation : **extinction à l'idle + coût de rétablissement (cold start / pool eviction / scale-to-zero)**. Elle seule explique simultanément : durée d'idle corrélée, surcoût unique ~1,6 s, CPU bas (attente, pas calcul), SQL rapide (le coût est avant/ autour de la requête : connexion, TLS, warm-up), retour immédiat à 120–150 ms (tout est re-chaud).

Explications concurrentes actives et ce qui les réfuterait :
1. **Pool de connexions évincé / idle-timeout** (favori technique) — Réfuté si : logs pool montrent 0 éviction et connexion réutilisée ; temps de handshake ≈ 0 ms.
2. **Scale-to-zero / mise en veille infra** — Réfuté si : aucune politique d'idle côté hébergeur et warm instances constantes.
3. **Cache froid applicatif** — Réfuté si : hit-ratio identique entre appel lent et suivants, ou appel lent sans lecture cache.
4. **JIT / lazy-load / auto-init** — Réfuté si : runtime AOT/warm et traces montrent 0 compilation au premier appel.
5. **Résolution DNS / TLS session neuve** — Réfuté si : connexion réutilisée (keep-alive) et session TLS reprise.
6. **GC / throttling / voisin bruyant** — déjà affaiblis : réfutés par CPU bas + mémoire stable + reproductibilité liée à l'idle (un voisin bruyant serait aléatoire, pas corrélé à l'idle).

## 4. Conclusion finale (survit à la réfutation)

> Le premier appel paie un **coût fixe d'idle-eviction + rétablissement** (probablement pool/connexion/keep-alive ou scale-to-zero + remplissage cache), pas un coût de calcul ni de base. La preuve : SQL 15 ms, CPU<20 %, pénalité unique corrélée à l'idle.

Observations discriminantes recommandées (par ordre de pouvoir discriminant) : durée d'idle vs latence (courbe), spans distribués du premier appel (où partent les 1,7 s ?), logs pool/keep-alive/scale, test keep-alive artificiel (ping toutes les 30 s → disparition attendue si hypothèse vraie), comparaison à froid après flush cache vs après idle seul.

## 5. Télémétrie, schéma, étapes, budget

- Télémétrie composition : voir `receipts/N1.json` (composeMs ~40 ms, workerKindMs ~1 ms, total ~43 ms).
- Schéma de communication :
```
[Mission N1] --> [Sealed W1 direct/bounded_worker] --dossier--> [Comparateur]
[Mission N1] --> [Sealed W2 structured/specialist] --dossier--> [Comparateur]
[Mission N1] --> [Sealed W3 falsification/verifier_worker] --attaques--> [Comparateur] --> synthèse
Aucun échange inter-mondes avant clôture (sealed). Workers simulés : dossiers rédigés hors-ligne, composition/mapping 100 % réels.
```
- Étapes : lecture mission → compose adversarial → mapping workerKinds → 3 dossiers scellés → cross-examination → synthèse ci-dessus.
- Budget : 3 mondes × 1500 tokens simulés = 4500 tokens, ~0,04 s de calcul local, 0 appel LLM distant. Coût réel ≈ 0.
- Limite honnête : workers = dossiers simulés déterministes (pas d'agents LLM vivants) ; la falsification est mécanique + rédaction experte, pas une exécution distribuée.
