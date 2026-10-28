"""Estimate paired effect sizes and detectable effects from public OMEGA outputs."""

import argparse
import json
import math
import statistics
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

from evaluate import is_correct, load_oracle

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
ALPHA = 0.05
POWERS = (0.80, 0.90)
STANDARDIZED_EFFECTS = (0.2, 0.5, 0.8)
BINARY_EFFECTS = (0.05, 0.10, 0.15)
SCENARIO_COUNTS = json.loads((ROOT / "protocol.json").read_text(encoding="utf-8"))["dataset"]["scenarios_by_experiment"]

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def public_results_dir(path):
    root, resolved = RESULTS.resolve(), path.resolve()
    if not resolved.is_relative_to(root): raise ValueError("results directory must stay under public results/")
    if not resolved.is_dir(): raise FileNotFoundError(resolved)
    return resolved

@lru_cache(maxsize=None)
def read_condition(filename, condition):
    return {key: rows for key, rows in group_rows(read_jsonl(RESULTS / filename), condition).items()}

def group_rows(rows, condition):
    grouped = defaultdict(list)
    for row in rows:
        if row.get("condition_id") == condition:
            grouped[(row.get("scenario_id"), row.get("repetition"))].append(row)
    duplicates = {key for key, values in grouped.items() if len(values) != 1}
    if duplicates:
        raise ValueError(f"duplicate result keys for {condition}: {len(duplicates)}")
    return {key: values[0] for key, values in grouped.items()}

def scenario_values(rows, metric, oracle):
    grouped = defaultdict(list)
    for row in rows.values():
        grouped[row["scenario_id"]].append(row)
    output = {}
    for scenario, repetitions in grouped.items():
        if len(repetitions) != 3:
            continue
        values = [row.get("telemetry", {}).get(metric) for row in repetitions]
        if all(isinstance(value, (int, float)) for value in values):
            output[scenario] = {"continuous": statistics.median(values)}
        if oracle and scenario in oracle:
            correct = [row.get("status") == "completed"
                       and is_correct(row.get("answer"), oracle[scenario]) for row in repetitions]
            output.setdefault(scenario, {})["binary"] = all(correct)
    return output

@lru_cache(maxsize=None)
def z_for_probability(probability):
    low, high = -9.0, 9.0
    for _ in range(100):
        middle = (low + high) / 2
        if 0.5 * math.erfc(-middle / math.sqrt(2)) < probability:
            low = middle
        else:
            high = middle
    return (low + high) / 2

def z_power(power):
    return z_for_probability(power)

def required_n_for_d(effect, alpha, power):
    if effect <= 0:
        return None
    z_alpha = z_for_probability(1 - alpha / 2)
    return math.ceil(((z_alpha + z_power(power)) / effect) ** 2)

def required_n_binary(input):
    effect, discordance, alpha, power = (input[key] for key in ("effect", "discordance", "alpha", "power"))
    if effect <= 0 or effect * effect >= discordance:
        return None
    z_alpha = z_for_probability(1 - alpha / 2)
    numerator = z_alpha * math.sqrt(discordance) \
        + z_power(power) * math.sqrt(discordance - effect * effect)
    return math.ceil((numerator / effect) ** 2)

def binary_mde(input):
    sample_count, discordance, alpha, power = (input[key]
        for key in ("sample_count", "discordance", "alpha", "power"))
    if sample_count <= 0 or discordance <= 0:
        return 0.0
    low, high = 0.0, math.sqrt(discordance) - 1e-12
    for _ in range(100):
        middle = (low + high) / 2
        required = required_n_binary({"effect": middle, "discordance": discordance,
                                      "alpha": alpha, "power": power})
        if required is None or required > sample_count:
            low = middle
        else:
            high = middle
    return high

def continuous_summary(differences, alpha):
    count = len(differences)
    mean_diff = statistics.mean(differences) if differences else None
    variance = statistics.variance(differences) if count > 1 else 0.0 if count else None
    deviation = math.sqrt(variance) if variance is not None else None
    power = continuous_power_plan({"count": count, "mean": mean_diff,
                                   "deviation": deviation, "alpha": alpha})
    return {"independent_scenarios": count, "mean_paired_difference": mean_diff,
            "sample_variance": variance, "sample_sd": deviation,
            "standardized_mean_effect_dz": None if not deviation else mean_diff / deviation,
            "planning": power}


def continuous_power_plan(input):
    count, mean_diff, deviation, alpha = (input[key]
        for key in ("count", "mean", "deviation", "alpha"))
    power = {}
    for target in POWERS:
        detectable = None if deviation is None else z_for_probability(1 - alpha / 2) + z_power(target)
        power[str(target)] = {
            "mde_observed_units": None if not count else detectable * deviation / math.sqrt(count),
            "n_required_at_observed_effect": None if deviation in (None, 0) or mean_diff == 0
            else required_n_for_d(abs(mean_diff) / deviation, alpha, target),
            "n_required_for_standardized_effects": {
                str(effect): required_n_for_d(effect, alpha, target)
                for effect in STANDARDIZED_EFFECTS
            }
        }
    return power

def binary_summary(pair_values, alpha):
    control_only = sum(left and not right for left, right in pair_values)
    treatment_only = sum(right and not left for left, right in pair_values)
    count = len(pair_values)
    discordance = (control_only + treatment_only) / count if count else None
    difference = (treatment_only - control_only) / count if count else None
    planning_discordance = discordance if discordance else 0.20
    planning = binary_power_plan({"count": count, "discordance": planning_discordance,
                                  "alpha": alpha})
    return {"independent_scenarios": count, "control_only_success": control_only,
            "treatment_only_success": treatment_only, "discordant_pair_rate": discordance,
            "paired_risk_difference_treatment_minus_control": difference,
            "planning_discordance_rate": planning_discordance if count else None,
            "planning_discordance_basis": "observed" if discordance else "fallback_assumption_0.20",
            "planning": planning}


def binary_power_plan(input):
    count, discordance, alpha = (input[key] for key in ("count", "discordance", "alpha"))
    return {str(power): {"mde_absolute_risk_difference": binary_mde({
        "sample_count": count, "discordance": discordance, "alpha": alpha, "power": power}),
        "n_required_by_absolute_difference": {str(effect): required_n_binary({
            "effect": effect, "discordance": discordance, "alpha": alpha, "power": power})
            for effect in BINARY_EFFECTS}}
        for power in POWERS} if count else {}

def analyze_pair(spec, oracle, family_sizes):
    left = read_condition(spec["left_file"], spec["left_condition"])
    right = read_condition(spec["right_file"], spec["right_condition"])
    left = filter_scope(left, spec["scope"])
    right = filter_scope(right, spec["scope"])
    shared = sorted(set(left) & set(right))
    left_scenarios = scenario_values(left, "latency_ms", oracle)
    right_scenarios = scenario_values(right, "latency_ms", oracle)
    paired_scenarios = sorted(set(left_scenarios) & set(right_scenarios))
    family_size = family_sizes[spec["family"]]
    corrected_alpha = ALPHA / family_size
    expected_scenarios = sum(SCENARIO_COUNTS[experiment] for experiment in spec["scope"])
    expected_runs = expected_scenarios * 3
    continuous = {}
    for metric in ("latency_ms", "input_bytes", "output_bytes"):
        left_metric = scenario_metric(left, metric)
        right_metric = scenario_metric(right, metric)
        differences = [right_metric[item][metric] - left_metric[item][metric]
                       for item in paired_scenarios
                       if item in left_metric and item in right_metric]
        continuous[metric] = continuous_summary(differences, corrected_alpha)
    binary_pairs = [(left_scenarios[item]["binary"], right_scenarios[item]["binary"])
                    for item in paired_scenarios
                    if "binary" in left_scenarios[item] and "binary" in right_scenarios[item]]
    return {"id": spec["id"], "family": spec["family"], "left": spec["left_condition"],
            "right": spec["right_condition"], "scope": spec["scope"],
            "confirmatory_eligible": spec["confirmatory_eligible"],
            "limitation": spec.get("limitation"),
            "family_size_for_planning": family_size,
            "familywise_alpha": ALPHA, "bonferroni_alpha_per_contrast": corrected_alpha,
            "expected_scenarios": expected_scenarios, "expected_paired_repetitions": expected_runs,
            "paired_repetitions": len(shared), "paired_scenarios": len(paired_scenarios),
            "missing_or_unpaired_keys": max(0, expected_runs - len(shared))
            + abs(len(left) - len(shared)) + abs(len(right) - len(shared)),
            "continuous": continuous,
            "binary_all_three_repetitions_success": binary_summary(binary_pairs, corrected_alpha)}

def filter_scope(rows, experiments):
    allowed = set(experiments)
    return {key: row for key, row in rows.items() if row.get("experiment_id") in allowed}

def scenario_metric(rows, metric):
    grouped = defaultdict(list)
    for row in rows.values():
        grouped[row["scenario_id"]].append(row)
    output = {}
    for scenario, repetitions in grouped.items():
        values = [row.get("telemetry", {}).get(metric) for row in repetitions]
        if len(values) == 3 and all(isinstance(value, (int, float)) for value in values):
            output[scenario] = {metric: statistics.median(values)}
    return output

def pair_spec(input):
    return {"id": input["id"], "family": input["family"],
            "left_file": input["left"][0], "left_condition": input["left"][1],
            "right_file": input["right"][0], "right_condition": input["right"][1],
            "scope": input["scope"], "confirmatory_eligible": input["eligible"],
            "limitation": input.get("limitation")}

def planned_specs():
    specs = []
    for experiment in [f"E{number:02d}" for number in range(1, 13)]:
        specs.append(pair_spec({"id": f"D_vs_A_{experiment}", "family": "primary_D_A",
            "left": ("A-reference.jsonl", "A"), "right": ("D-genos-full.jsonl", "D"),
            "scope": [experiment], "eligible": True}))
        for left_file, left_id, right_file, right_id, label in (
            ("A-reference.jsonl", "A", "B-gcir-minimal.jsonl", "B", "B_vs_A"),
            ("B-gcir-minimal.jsonl", "B", "C-gcir-optimized.jsonl", "C", "C_vs_B"),
            ("C-gcir-optimized.jsonl", "C", "D-genos-full.jsonl", "D", "D_vs_C"),
        ):
            specs.append(pair_spec({"id": f"{label}_{experiment}", "family": "attribution",
                "left": (left_file, left_id), "right": (right_file, right_id),
                "scope": [experiment], "eligible": True}))
    baselines = {
        "MLIR": ["E01", "E02", "E03", "E04", "E12"],
        "TEMPORAL": ["E05", "E06", "E07"],
        "LANGGRAPH": ["E05", "E06", "E07", "E10"],
        "A2A": ["E07", "E12"], "MCP": ["E07", "E12"], "OPA": ["E03", "E08"]
    }
    for condition, experiments in baselines.items():
        filename = f"{condition}-baseline.jsonl"
        for experiment in experiments:
            specs.append(pair_spec({"id": f"D_vs_{condition}_{experiment}",
                "family": "external_baselines", "left": (filename, condition),
                "right": ("D-genos-full.jsonl", "D"), "scope": [experiment], "eligible": False,
                "limitation": "External baseline adapter has a different stack; descriptive comparator only."}))
    specs.extend([
        pair_spec({"id": "A1_optimizer_E04", "family": "ablations",
            "left": ("A1-off.jsonl", "A1-off"), "right": ("A1-on.jsonl", "A1-on"),
            "scope": ["E04"], "eligible": True}),
        pair_spec({"id": "A2_static_verification_E03", "family": "ablations",
            "left": ("ABLATION-A2-off.jsonl", "A2-off"), "right": ("ABLATION-A2-on.jsonl", "A2-on"),
            "scope": ["E03"], "eligible": False,
            "limitation": "Compiler bypass versus compiler+guarded runtime; not an isolated runtime-native static-verification toggle."}),
        pair_spec({"id": "A3_strong_typing_E03", "family": "ablations",
            "left": ("A3-off.jsonl", "A3-off"), "right": ("A3-on.jsonl", "A3-on"),
            "scope": ["E03"], "eligible": True}),
        pair_spec({"id": "A4_harness_replay_E05", "family": "ablations",
            "left": ("A4-E05-control.jsonl", "A4_CONTROL"),
            "right": ("A4-E05-journal-native.jsonl", "A4_JOURNAL_NATIVE"),
            "scope": ["E05"], "eligible": False,
            "limitation": "Harness-level journal/fsync/reexecute control; not native G-CIR journaling/replay."}),
        pair_spec({"id": "A5_morphogenesis_E10", "family": "ablations",
            "left": ("ABLATION-A5.jsonl", "A5"), "right": ("D-genos-full.jsonl", "D"),
            "scope": ["E10"], "eligible": True,
            "limitation": "Same D envelope/compiler/policy/runtime; only CALL handler changes. Public development scope E10."}),
        pair_spec({"id": "A6_physiology_E11", "family": "ablations",
            "left": ("ABLATION-A6.jsonl", "A6"), "right": ("D-genos-full.jsonl", "D"),
            "scope": ["E11"], "eligible": True,
            "limitation": "Same D envelope/compiler/policy/runtime; only CALL handler changes. Public development scope E11."}),
        pair_spec({"id": "A8_typed_JSON_all_experiments", "family": "ablations",
            "left": ("ABLATION-A8.jsonl", "A8"), "right": ("D-genos-full.jsonl", "D"),
            "scope": [f"E{number:02d}" for number in range(1, 13)], "eligible": True,
            "limitation": "Full public scope uses D's task service map; real GenOS services are present only on E10/E11, while other workloads use the same deterministic reference handlers."}),
    ])
    return specs

def analyze_a7(oracle):
    rows = group_rows(read_jsonl(RESULTS / "ABLATION-A7.jsonl"), "A7")
    scenarios = defaultdict(list)
    for (scenario, _), row in rows.items():
        scenarios[scenario].append(row)
    differences = []
    ratios = []
    binary_pairs = []
    for values in scenarios.values():
        if len(values) != 3:
            continue
        differences.append(statistics.median(row["metrics"]["json_bytes"]
                                             - row["metrics"]["compact_bytes"] for row in values))
        ratios.append(statistics.median(row["metrics"]["byte_saving_ratio"] for row in values))
        passed = all(row["status"] == "completed"
                     and row["metrics"].get("compact_roundtrip_verified") is True
                     and is_correct(row["answer"], oracle[row["scenario_id"]]) for row in values)
        binary_pairs.append((passed, passed))
    planning = continuous_summary(differences, ALPHA / 8)
    return {"id": "A7_compact_bytes_vs_JSON_E02", "family": "ablations",
            "confirmatory_eligible": True, "limitation": "Paired size measures embedded in one adapter; not independent arm timing.",
            "paired_scenarios": len(differences), "mean_bytes_saved": statistics.mean(differences) if differences else None,
            "variance_bytes_saved": statistics.variance(differences) if len(differences) > 1 else None,
            "median_fraction_saved": statistics.median(ratios) if ratios else None,
            "family_size_for_planning": 8, "bonferroni_alpha_per_contrast": ALPHA / 8,
            "planning": planning["planning"],
            "binary_roundtrip_and_oracle_success": binary_summary(binary_pairs, ALPHA / 8)}

def format_number(value):
    return "N/A" if value is None else f"{value:.3f}"

def contrast_line(item):
    latency = item.get("continuous", {}).get("latency_ms", {})
    binary = item.get("binary_all_three_repetitions_success", {})
    n_required = binary.get("planning", {}).get("0.8", {}).get(
        "n_required_by_absolute_difference", {}).get("0.15")
    return (f"| {item['id']} | {item['paired_scenarios']} | "
            f"{format_number(latency.get('mean_paired_difference'))} | "
            f"{format_number(latency.get('sample_sd'))} | "
            f"{format_number(latency.get('planning', {}).get('0.8', {}).get('mde_observed_units'))} | "
            f"{binary.get('control_only_success', 'N/A')}/{binary.get('treatment_only_success', 'N/A')} | "
            f"{n_required if n_required is not None else 'N/A'} |")

def ablation_line(item):
    latency = item.get("continuous", {}).get("latency_ms", {})
    binary = item.get("binary_all_three_repetitions_success", {})
    n_required = binary.get("planning", {}).get("0.8", {}).get(
        "n_required_by_absolute_difference", {}).get("0.15")
    eligible = "oui" if item["confirmatory_eligible"] else "non"
    return (f"| {item['id']} | {item['paired_scenarios']} | {eligible} | "
            f"{format_number(latency.get('mean_paired_difference'))} | "
            f"{format_number(latency.get('sample_sd'))} | "
            f"{format_number(latency.get('planning', {}).get('0.8', {}).get('mde_observed_units'))} | "
            f"{binary.get('control_only_success', 'N/A')}/{binary.get('treatment_only_success', 'N/A')} | "
            f"{n_required if n_required is not None else 'N/A'} |")
def render_report(report):
    families = report["family_sizes"]
    contrasts = report["contrasts"]
    primary = [item for item in contrasts if item.get("family") == "primary_D_A"]
    ablations = [item for item in contrasts if item.get("family") == "ablations"]
    a7 = next(item for item in ablations if item["id"].startswith("A7_"))
    lines = ["# Analyse de puissance OMEGA-BENCH sur sorties publiques — 2026-10-28", "",
        "Cette analyse lit uniquement `dataset/oracle/` et les sorties publiques sous `results/`; le holdout n'est ni lu ni modifié.", "",
        "## Méthode", "",
        "L'unité indépendante est le scénario. Les trois répétitions sont résumées par leur médiane avant calcul de la variance des différences appariées. Les issues binaires sont résumées par scénario: succès seulement si les trois répétitions sont conformes à l'oracle. Aucun p-value ni résultat confirmatoire n'est produit.", "",
        f"Les effets détectables et tailles requises utilisent une approximation normale bilatérale, puissance 80 %/90 %, et une borne Bonferroni `alpha=0,05/m`. Les familles et `m` retenus sont: D/A = {families['primary_D_A']}, attribution B/A-C/B-D/C = {families['attribution']}, baselines externes = {families['external_baselines']}, ablations prévues = {families['ablations']}. Le plan confirmatoire proposé devra encore appliquer Holm aux résultats d'une campagne gelée.", "",
        "**Audit des chronométrages : A–D mesurent maintenant la même frontière** (objet scénario déjà décodé → réponse sémantique, événements de trace exclus), et les sorties actuelles ont toutes été produites sur la révision `bcb093fefbb5cb7a43be7b68f4347bf5f2d93c6c`. Ces latences restent descriptives : les runs ont eu lieu sur une VM partagée, sans isolation confirmatoire ni plan statistique préenregistré. Elles ne prouvent aucun avantage de performance.", "",
        "## Contrastes principaux D/A", "",
        "La différence de latence est calculée D moins A en ms; `SD` est l'écart-type des différences appariées par scénario. `MDE80` est l'effet minimum détectable dans ces unités à 80 % de puissance et sous la correction familiale ci-dessus. `discordances C/T` compte les scénarios où seul le contrôle C ou seul le traitement T réussit aux trois répétitions.", "",
        "| Contraste | n scénarios | Δ latence moyenne (ms) | SD Δ (ms) | MDE80 (ms) | Discordances C/T | n80 pour différence binaire 15 pp |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    lines.extend(contrast_line(item) for item in primary)
    lines.extend(["", "Tous les contrastes D/A ont une couverture complète du scope public et les 10 200 paires scénario-répétition attendues au total. Le JSON associé contient aussi les variances et effets détectables pour latence, octets d'entrée/sortie, tailles `n` pour effets standardisés 0,2/0,5/0,8, et les discordances binaires.", "",
        "## Ablations exécutées ou approchées", "",
        "| Ablation/contrôle | n | Éligible comme candidat confirmatoire | Δ latence moyenne (ms) | SD Δ (ms) | MDE80 (ms) | Discordances C/T | n80 pour différence binaire 15 pp |", "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |"])
    lines.extend(ablation_line(item) for item in ablations if item is not a7)
    a7_binary = a7["binary_roundtrip_and_oracle_success"]
    a7_n15 = a7_binary["planning"]["0.8"]["n_required_by_absolute_difference"]["0.15"]
    lines.extend(["", f"A7: {a7['paired_scenarios']} scénarios; moyenne économisée {format_number(a7['mean_bytes_saved'])} octets/scénario, variance {format_number(a7['variance_bytes_saved'])}, médiane de sauvegarde relative {format_number(a7['median_fraction_saved'] * 100)} %. Le round-trip/oracle a {a7_binary['control_only_success']}/{a7_binary['treatment_only_success']} discordances; n80 à 15 points vaut {a7_n15} sous la discordance de planification 0,20. Le MDE continu et le n requis sont disponibles dans le JSON à `alpha=0,05/8`; l'encodage compact et l'enveloppe JSON sont mesurés dans le même adaptateur, pas dans deux processus indépendants.", "",
        "A2 est un contraste de banc (compilateur contourné contre compile+runtime restant gardé) et A4 est journal/replay au niveau harness; ils sont fournis à titre descriptif et exclus de la preuve confirmatoire comme ablations runtime natives. A5/A6 sont maintenant des contrôles appariés: même enveloppe, compileur, politique et runtime D, seul le handler CALL passe du service GenOS au handler de référence. A8 couvre les douze expériences publiques en JSON direct avec la même carte de services que D; les services GenOS réels ne sont utilisés que pour E10/E11, et les autres expériences gardent les handlers de référence. L'attribution GenOS reste donc limitée à E10/E11. Tous ces résultats sont publics et non préenregistrés; les résultats statistiques restent descriptifs.", "",
        "## Baselines et portée", "",
        f"Les {families['external_baselines']} contrastes baseline applicables sont appariés sur leurs scénarios communs déclarés. Ils restent descriptifs: les stacks, les métriques fonctionnelles et les frontières de latence ne sont pas interchangeables. Le calcul inclut toutes les expériences applicables disponibles depuis MLIR, Temporal, LangGraph, A2A, MCP et OPA; A est la référence JSON, déjà couverte par la famille D/A.", "",
        "Lorsque les données ont zéro discordance binaire, la variance observée ne peut pas estimer la puissance d'un effet non nul. Pour les tableaux `n requis`, le script emploie explicitement l'hypothèse de planification `p(discordance)=0,20`; le JSON indique cette source. Sinon, le taux de discordance observé sur données publiques est utilisé comme hypothèse de planification, sans valeur confirmatoire.", "",
        "Limites: corpus synthétique public, matériel partagé, adaptateurs non tous équivalents, approximation normale plutôt que test exact, et quelques contrastes limités à une expérience. Cette analyse sert à dimensionner une étude ultérieure; ses latences restent descriptives et elle ne débloque pas le préenregistrement ni le holdout.", ""])
    return "\n".join(lines)
def build_report():
    oracle = load_oracle()
    specs = planned_specs()
    counts = {"primary_D_A": 12, "attribution": 36, "external_baselines":
              sum(1 for item in specs if item["family"] == "external_baselines"), "ablations": 8}
    contrasts = [analyze_pair(spec, oracle, counts) for spec in specs]
    contrasts.append(analyze_a7(oracle))
    return {"protocol": "OMEGA-BENCH-2026", "source_scope": "public result files only; sealed holdout not read",
            "method": {"independent_unit": "scenario; median of three repetitions",
                       "continuous_variance": "sample variance of paired scenario-level median latency differences",
                       "latency_status": "descriptive only; A-D use a common timing boundary and matched revision, but shared-host runs are not confirmatory",
                       "common_latency_boundary": "implemented in A-D adapters: decoded scenario object to semantic answer, trace events excluded; public rerun required before freeze",
                       "binary": "scenario passes only when all three repetitions are oracle-correct; discordances are counted by scenario",
                       "power_approximation": "two-sided normal planning; no p-values or confirmatory claims",
                       "family_correction": "Bonferroni alpha=0.05/m, conservative planning bound; final preregistered tests use Holm"},
            "family_sizes": counts,
            "ablation_scope": {"design_eligible_for_future_confirmatory_candidates": ["A1_optimizer_E04", "A3_strong_typing_E03", "A5_morphogenesis_E10", "A6_physiology_E11", "A7_compact_bytes_vs_JSON_E02", "A8_typed_JSON_all_experiments"],
                               "excluded_from_confirmatory_evidence": ["A2_static_verification_E03", "A4_harness_replay_E05"]},
            "contrasts": contrasts}
def main():
    global RESULTS
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results-dir", type=Path, default=RESULTS, help="public result directory (defaults to results/)")
    args = parser.parse_args()
    RESULTS = public_results_dir(args.results_dir)
    output = RESULTS / "power-analysis-public.json"
    report = build_report()
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_path = ROOT / "reports" / "analyse-puissance-publique-2026-10-28.md"
    report_path.write_text(render_report(report), encoding="utf-8")
    print(f"Wrote public paired power analysis: {output}")
    print(f"Wrote public paired power report: {report_path}")
    print(json.dumps({"family_sizes": report["family_sizes"],
                      "contrasts": len(report["contrasts"]),
                      "holdout_read": False}, ensure_ascii=False))

if __name__ == "__main__":
    main()
