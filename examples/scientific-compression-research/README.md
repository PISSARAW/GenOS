# Recherche scientifique versionnee

Cette demonstration utilise la fonctionnalite `experiment scientific` de GenOS.
Elle ne depend d'aucun LLM ni fournisseur externe : les cinq strategies sont
executees par le runtime, leur round-trip est verifie et les mesures sont
reproductibles.

```powershell
cargo run -p genos-cli -- experiment scientific examples/scientific-compression-research/experiment.yaml --summary
```

Le rapport complet est conserve dans
`.genos/experiments/compression-research-v1/reports/compression-research-v1.json`.
Il contient :

- la lignee H0, H1, H2, H3, H3a, H3b, H3c et H4 ;
- le code, les protocoles et les resultats sous forme d'artifacts SHA-256 ;
- les critiques croisees et l'evolution des croyances ;
- une reproduction confirmee de H1 et un audit contradictoire de H3 ;
- `H3-recheck`, restaure depuis le snapshot H0 sans supprimer H3.

Le rapport distingue ainsi la timeline des conclusions de l'historique des
snapshots scientifiques. Une conclusion suspecte reste inspectable meme quand
une nouvelle investigation repart de son etat anterieur.
