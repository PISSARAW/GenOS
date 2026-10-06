# ADR 0330 — Effets durables et reprise vérifiée de Metapopulation

- Statut : accepté
- Date : 2026-10-06

PLAN reste sans effet. VERIFY relit les reçus et les états locaux, et RECORD inscrit atomiquement le cycle et son état de reprise.

Les extinctions exigent la perte des workers et des fonctions locales. La recolonisation exige deux lignées distinctes compatibles, exclut les échecs du même patch et attend une viabilité booléenne, une fitness bornée et une provenance. Le nouveau dème devient actif dans la transaction d'acceptation. Un dème historique ne peut pas libérer l'occupation de son successeur.

Les profils et résultats des îlots sont persistés. Les adaptateurs Rust et solveur restent explicites. Les migrations des variants passent par les gardes communes. Le receveur peut accepter, rejeter, demander des preuves ou adapter puis revalider. Une identité réutilisée pour un autre payload est rejetée. Le rescue conserve la mesure initiale et l'évaluation avant rollback afin de reprendre sans réassimilation. Fitness finale et résultat sont enregistrés ensemble.

Les obligations fédérales ne valent pas satisfaction. Les réserves ont des reçus durables. Les résidents utilisent des capsules réelles, des leases et une mémoire versionnée dont la décroissance est conservée. La fitness locale et la certification exigent des preuves d'évaluation ; un hash n'est jamais une mesure de fitness.

La suite `npm --prefix backend run test:metapopulation` couvre les 12 variants documentés et les 4 profils historiques, ainsi que les interruptions et les preuves invalides. Les fixtures d'adaptateur ne certifient pas les performances des moteurs externes. Le benchmark de métriques reste synthétique ; cet ADR ne promeut pas automatiquement la maturité globale.
