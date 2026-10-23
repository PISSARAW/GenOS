# Campagnes Qwen SHEV sur D: — 23 octobre 2026

## Périmètre

Cette campagne mesure le protocole de pression développementale SHEV et le transfert vers des tâches réservées. Elle n’injecte pas de lésion cachée dans GenOS : elle ne constitue donc pas SH‑001 ni une preuve d’auto-guérison. Les bases, audits bruts et sorties JSON sont conservés sous `D:\GenOS\runs\`; ils ne sont pas ajoutés au dépôt, conformément à `AGENTS.md` qui interdit de versionner les DB et artefacts générés.

Les six expériences locales recommandées dans la note jointe ont toutes passé sur ce worktree D: :

| Vérification | Résultat |
| --- | --- |
| `node backend/tests/test_shev_healing_contract.js` | PASS — phases durables, preuves et clôture terminale |
| `node backend/tests/test_shev_healing_integration.js` | PASS — tick, Ontogenesis, effet et preuve longitudinale |
| `node backend/tests/test_physiological_arc_closed_loop.js` | PASS — les quatre connexions de la boucle physiologique |
| `node backend/tests/test_sre_healing_policy.js` | PASS — 10/10 sous-tests |
| `node backend/tests/test_sre_healing_store.js` | PASS — 3/3 sous-tests |
| `node backend/tests/test_security_qualification_lab.js` | PASS |

Ces tests valident les contrats et simulations locales, sans prouver une réparation de lésion inconnue en environnement réel.

## Campagne Qwen 2.5-Coder 7B

- Campagne : `qwen-shev-direct-d-20261023-01` ; modèle Ollama réellement invoqué : `ollama://qwen2.5-coder:7b`.
- HEAD qualifié par le daemon en lecture seule : `adf92beb5570e3daf5b71dd5bf4c1acd0246b73e`; index : 49 fichiers, même HEAD.
- Oracle indépendant : `genos-qwen-source-oracle-v1`; 20 réponses consignées (cinq tâches d’entraînement et cinq réservées dans chacun des deux bras).
- Résultat : contrôle 10/10, traitement 10/10; cinq égalités, p=1. Toutes les tâches d’entraînement sont réussies : aucune « douleur » n’est observée et aucun gain adaptatif n’est testable.
- Le rapport de campagne est `protocol_only`, `benchmarkQualified=false`, `promotionEligible=false`. Le ratio de tokens traitement/contrôle est 1,2804, au-dessus du plafond de 1,25.
- DB : `D:\GenOS\runs\qwen-shev-20261023.db` — SHA-256 `5986DE7D56416168DC97984321CE8FFF7CDB3AA05B0DAF7A6C080E93A85C3094`.
- Audit JSONL (20 lignes) : `D:\GenOS\runs\qwen-shev-20261023.audit.jsonl` — SHA-256 `1E25EC32E6CAE397DCE85F4E06855549248E0D61BF4D193BB472CCADDFF52DC6`.

## Réplication Qwen 2.5 0.5B

- Campagne : `qwen-shev-direct-d-20261023-02-qwen05` ; modèle : `ollama://qwen2.5:0.5b`.
- Le daemon a indexé 49 fichiers au HEAD `adf92beb5570e3daf5b71dd5bf4c1acd0246b73e`; oracle `genos-qwen-source-oracle-v1`; 20 réponses auditées.
- Entraînement : contrôle 3/5, traitement 2/5. Tâches réservées : contrôle 2/5, traitement 2/5; cinq égalités, p=1. La pression développementale croît, mais aucun progrès réservé n’est confirmé et aucune pression n’est effacée.
- Le traitement consomme 3 822 tokens contre 2 590 pour le contrôle (ratio 1,4218); le rapport reste `protocol_only`, non qualifié et non promouvable. Le signal de douleur est bien détecté, mais le transfert n’est pas démontré.
- Sortie JSON : `D:\GenOS\runs\qwen-shev-20261023-qwen05-output.json` — SHA-256 `33662942104987E6FC67D755DC568F1862AA12741EC2C671A8454A7AE9D23D2D`.
- Audit JSONL : `D:\GenOS\runs\qwen-shev-20261023-qwen05.audit.jsonl` — SHA-256 `59BE875B10DAD867FC3BD7D2A2628BD2878B199F4D63D9023937AF51DF683827`.
- DB : `D:\GenOS\runs\qwen-shev-20261023-qwen05.db` — SHA-256 `D37136F62E143E23F21B32103DE514F345CAF8BBB9785DCEE9204292C3DF5B22`.

Commande reproductible (nouveaux identifiants et chemins requis pour une nouvelle réplication) :

```powershell
$env:OPENCODE_TMP_DIR='D:\GenOS\runs\qwen-shev-<run>'
node backend\bin\run-shev-qwen-campaign.cjs `
  --db 'D:\GenOS\runs\qwen-shev-<run>.db' `
  --model 'ollama://qwen2.5-coder:7b' `
  --campaign-id 'qwen-shev-<unique-id>' `
  --audit 'D:\GenOS\runs\qwen-shev-<run>.audit.jsonl'
```

## Conclusion et travail restant

La batterie locale est verte et deux campagnes Qwen ont réellement complété leur protocole avec oracle indépendant. Elles ne démontrent toutefois ni réparation autonome d’un dommage inconnu, ni amélioration sur des cas réservés, ni maintien sur 72 heures. SH‑001 reste à construire/exécuter avec défaut caché, bras contrôle et traitement, contre-test indépendant, rollback et suivi; aucune guérison ne peut être annoncée à ce stade.

La tentative `mcp__genos__genos_orchestrate` pour ce périmètre a échoué avec `Transport closed`. La campagne Qwen SHEV existante a servi de voie locale effective et a conservé ses reçus sur D:.
