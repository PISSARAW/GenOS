# GMUB — GenOS Model Uplift Benchmark

Protocole longitudinal (ADR 0035) : `solo` vs `genos` vs `compute_control`,
paires appariées même cas, bootstrap 95%, ladder émergente, HMB.

Première campagne réelle : voir `PROTOCOL.md` (phases 0–4),
`campaign-template.json` et :

```bash
node benchmarks/gmub/new-campaign.cjs --suite gmub-r1 --model <base> --models <m1,m2,m3> --cases <c1,c2> --out campaign.json
```

## Règle de victoire

`LCB95(D) > margin` => battu, sinon **inconclusif**. Jamais `73.2 > 72.8`.

## Exécution

```bash
node benchmarks/gmub/run-gmub.cjs --input benchmarks/gmub/example-runs.json --out /tmp/gmub-report.json
```

Le gabarit capture automatiquement le commit courant (`--seed` et
`--topology` peuvent être fixés explicitement). Après avoir rempli les
mesures, assembler les exports des phases :

```bash
node benchmarks/gmub/merge-measurements.cjs --campaign campaign.json --solo ladder-results.json --control compute-control-results.json --genos genos-results.json --out measured.json
```

L'export `genos-results.json` doit contenir un tableau de runs mesurés au
même format (`case_id`, `score`, tokens, coûts, latence, commit, topologie
et capacités). Les champs absents restent incomplets. Produire ensuite le
rapport et le persister dans la base locale :

```bash
node benchmarks/gmub/run-gmub.cjs --input measured.json --out report.json --persist backend/genos.db
node benchmarks/gmub/run-gmub.cjs --export-suite gmub-r1 --persist backend/genos.db --out gmub-r1-export.json
```

La persistance conserve les runs, les paires et la comparaison. Les runs
répétés sont appariés par cas et numéro de répétition. Le rapport expose
`integrity.status`; une campagne avec scores, coûts ou provenance manquants
reste `incomplete` et ne peut pas être présentée comme campagne complète.

`example-runs.json` : `{ suite, model, stats, cost, wmc: {frontier, margin}, runs: [...] }`.
Export reproductible : commit, topologie, `declared/activated/observed_capabilities`,
seed, tokens, coût, latence persistés en `uplift_runs` (migration `049`,
provenance modèle/répétition complétée par `081`) et réexportés en JSON.

## Tranche 2 — contrôle compute et WMC

- `compute_control` : mêmes cas, même modèle, compute naïf
  (`independent_samples`, `self_consistency`, `retry`, `majority_vote`),
  sans architecture GenOS. Le rapport exige `C > B > A` avec IC95 sur les
  trois paires (`abc.fullOrdering`) ; `organizationBonus` = gain GenOS
  au-delà du compute naïf.
- HMB et WMC ne retiennent un modèle comme battu que si la borne basse de
  l'IC apparié dépasse la marge. La WMC exige les mêmes cas entre le GenOS
  candidat et le frontier solo.
- Efficiency-matched : comparer `Quality/Cost` à budgets plafonnés égaux
  (`summarizeCost`), pas seulement les scores bruts.

## GCAB

Ablations `full vs -memory / -epistemics / -biomimicry / -evolution /
-recovery / -topology` : `Contribution = S(G) - S(G-cap)`, même harness,
`mode: ablation`.

Attribution des gains (`capabilityAttribution`) : un gain n'est attribué à
une topologie que si `observed ⊆ activated ⊆ declared` (leases
`toolLeasePolicy` + opérations réellement appelées, voir
`docs/02-orchestration/topologies-et-capacites.md`). Sinon le verdict est
`contract_only`, `leased_without_effect`, `observed_without_lease` ou
`unscoped_activation` — pas d'attribution au « Biome ».

Test biomimétique (`biomimicryTest`) : `bioSuperior` exige une victoire
IC95 sur les trois dimensions `exploration`, `recovery`, `diversity`.

## Carte GenOS Capability Uplift (template de publication)

```text
GENOS CAPABILITY UPLIFT — <version GenOS> / <suite>
Base model:            <M>
Standalone tier:       <Tx> (ladder emergente, jamais manuelle)
GenOS effective tier:  <Ty>   Tier uplift: +<n>   HMB: <modele>
Quality uplift:        <Δ pts>   95% CI: [<lcb>, <ucb>]   (LCB95 > margin, sinon inconclusif)
Cost multiplier:       <×>   Token multiplier: <×>   Quality / $: <+/-%>
ABC:                   C > B > A : <oui/non> (bonus d'organisation prouve)
WMC:                   <plus petit modele + GenOS > frontier>
Domains improved / neutral / degraded: <a / b / c>
Attribution:           <attributable | motif de refus>   Provenance: <hash>
```

`kind: metric`, `qualityGuarantee: false` : la carte informe la policy,
elle n'autorise rien à elle seule.
