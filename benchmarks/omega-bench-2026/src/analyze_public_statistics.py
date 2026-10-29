"""Exploratory paired statistics over public OMEGA-BENCH result files only."""

import argparse
import hashlib
import json
import math
import random
import statistics
from collections import defaultdict
from pathlib import Path

from analyze_power_public import planned_specs
from evaluate import is_correct, load_oracle

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
REPORT = ROOT / "reports" / "statistiques-exploratoires-2026-10-28.md"
JSON_REPORT = RESULTS / "statistiques-exploratoires.json"
BOOTSTRAP_REPLICATES = 2000
ALPHA = 0.05
PROVISIONAL = True
METRICS = ("latency_ms", "input_bytes", "output_bytes")


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()]


def public_results_dir(path):
    root = RESULTS.resolve()
    resolved = path.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError("results directory must stay under public results/") from error
    if not resolved.is_dir():
        raise FileNotFoundError(resolved)
    return resolved


def load_pair_rows(spec):
    pair = []
    for side in ("left", "right"):
        filename = spec[f"{side}_file"]
        condition = spec[f"{side}_condition"]
        rows = read_jsonl(RESULTS / filename)
        grouped = defaultdict(list)
        for row in rows:
            if row.get("condition_id") == condition:
                grouped[(row.get("scenario_id"), row.get("repetition"))].append(row)
        duplicate_keys = [key for key, values in grouped.items() if len(values) != 1]
        if duplicate_keys:
            raise ValueError(f"duplicate keys for {condition}: {len(duplicate_keys)}")
        pair.append({key: values[0] for key, values in grouped.items()})
    return pair


def summarize_scenario(scenario, repetitions, oracle):
    if len(repetitions) != 3 or scenario not in oracle:
        return None
    result = {metric: statistics.median(
        row.get("telemetry", {}).get(metric) for row in repetitions)
        for metric in METRICS
        if all(isinstance(row.get("telemetry", {}).get(metric), (int, float))
               for row in repetitions)}
    result["correct"] = all(row.get("status") == "completed"
                            and is_correct(row.get("answer"), oracle[scenario])
                            for row in repetitions)
    result["run_failure"] = any(row.get("status") != "completed"
                                or row.get("violations") for row in repetitions)
    return result


def scenario_summary(rows, context):
    scope, oracle = context
    grouped = defaultdict(list)
    for row in rows.values():
        if row.get("experiment_id") in scope:
            grouped[row["scenario_id"]].append(row)
    output = {}
    for scenario, repetitions in grouped.items():
        result = summarize_scenario(scenario, repetitions, oracle)
        if result is not None:
            output[scenario] = result
    return output


def exact_binomial_two_sided(successes, trials):
    if trials == 0:
        return None
    tail = min(successes, trials - successes)
    terms = [math.exp(math.lgamma(trials + 1) - math.lgamma(index + 1)
                      - math.lgamma(trials - index + 1) - trials * math.log(2))
             for index in range(tail + 1)]
    return min(1.0, 2 * math.fsum(terms))


def sign_test_p(differences):
    nonzero = [value for value in differences if value != 0]
    positives = sum(value > 0 for value in nonzero)
    return exact_binomial_two_sided(positives, len(nonzero))


def mcnemar_p(left, right):
    left_only = sum(a and not b for a, b in zip(left, right))
    right_only = sum(b and not a for a, b in zip(left, right))
    discordant = left_only + right_only
    return {"left_only": left_only, "right_only": right_only,
            "p_value": exact_binomial_two_sided(min(left_only, right_only), discordant)}


def seed_for(label):
    return int(hashlib.sha256(label.encode("utf-8")).hexdigest()[:16], 16)


def bootstrap_mean_ci(differences, label):
    if len(differences) < 2:
        return None
    rng = random.Random(seed_for(label))
    count = len(differences)
    estimates = [statistics.mean(differences[rng.randrange(count)]
                                 for _ in range(count))
                 for _ in range(BOOTSTRAP_REPLICATES)]
    estimates.sort()
    return [estimates[int(0.025 * BOOTSTRAP_REPLICATES)],
            estimates[int(0.975 * BOOTSTRAP_REPLICATES)]]


def paired_metric(left, right, metric_spec):
    metric, label = metric_spec
    shared = sorted(set(left) & set(right))
    differences = [right[key][metric] - left[key][metric] for key in shared
                   if metric in left[key] and metric in right[key]]
    if not differences:
        return None
    return {"n": len(differences), "mean_right_minus_left": statistics.mean(differences),
            "median_right_minus_left": statistics.median(differences),
            "bootstrap_95_ci_mean": bootstrap_mean_ci(differences, label),
            "sign_test_p": sign_test_p(differences)}


def add_tests(record, left, right):
    tests = {}
    for metric in METRICS:
        tests[metric] = paired_metric(
            left, right, (metric, f"{record['id']}:{metric}"))
    shared = sorted(set(left) & set(right))
    left_correct = [left[key]["correct"] for key in shared]
    right_correct = [right[key]["correct"] for key in shared]
    discordance = mcnemar_p(left_correct, right_correct)
    correctness_differences = [int(b) - int(a) for a, b in zip(left_correct, right_correct)]
    tests["oracle_correct"] = {
        "n": len(shared),
        "left_successes": sum(left_correct),
        "right_successes": sum(right_correct),
        "success_rate_difference": statistics.mean(correctness_differences) if shared else None,
        "bootstrap_95_ci_rate_difference": bootstrap_mean_ci(
            correctness_differences, f"{record['id']}:oracle_correct"),
        **discordance
    }
    record["tests"] = tests
    return record


def analyze_spec(spec, oracle):
    scope = set(spec["scope"])
    left_rows, right_rows = load_pair_rows(spec)
    context = (scope, oracle)
    left = scenario_summary(left_rows, context)
    right = scenario_summary(right_rows, context)
    shared = sorted(set(left) & set(right))
    record = {"id": spec["id"], "family": spec["family"], "scope": spec["scope"],
              "left_scenarios": len(left), "right_scenarios": len(right),
              "paired_scenarios": len(shared),
              "limitation": spec.get("limitation")}
    return add_tests(record, left, right)


def a7_scenario_result(scenario, repetitions, oracle):
    if len(repetitions) != 3 or scenario not in oracle:
        return None
    saving = statistics.median(row["metrics"]["json_bytes"]
                               - row["metrics"]["compact_bytes"]
                               for row in repetitions)
    correct = all(row.get("status") == "completed"
                  and row["metrics"].get("compact_roundtrip_verified") is True
                  and is_correct(row.get("answer"), oracle[scenario])
                  for row in repetitions)
    failed = any(row.get("status") != "completed" for row in repetitions)
    return saving, correct, failed


def group_a7_rows():
    rows = [row for row in read_jsonl(RESULTS / "ABLATION-A7.jsonl")
            if row.get("condition_id") == "A7"]
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["scenario_id"]].append(row)
    return grouped


def valid_a7_results(oracle, grouped):
    results = [a7_scenario_result(scenario, repetitions, oracle)
               for scenario, repetitions in grouped.items()]
    return [result for result in results if result is not None]


def a7_byte_test(savings):
    diff = statistics.mean(savings) if savings else None
    return {"n": len(savings), "mean_right_minus_left": diff,
            "median_right_minus_left": statistics.median(savings) if savings else None,
            "bootstrap_95_ci_mean": bootstrap_mean_ci(savings, "A7:byte_savings"),
            "sign_test_p": sign_test_p(savings)}


def a7_correctness_test(correctness):
    return {"n": len(correctness), "left_successes": sum(correctness),
            "right_successes": sum(correctness),
            "success_rate_difference": 0.0 if correctness else None,
            "bootstrap_95_ci_rate_difference": [0.0, 0.0] if correctness else None,
            "left_only": 0, "right_only": 0, "p_value": 1.0}


def a7_summary(oracle, grouped):
    results = valid_a7_results(oracle, grouped)
    savings = [result[0] for result in results]
    correctness = [result[1] for result in results]
    return {"id": "A7_compact_bytes_vs_JSON_E02", "family": "ablations",
            "scope": ["E02"], "left_scenarios": len(savings),
            "right_scenarios": len(savings), "paired_scenarios": len(savings),
            "limitation": "Embedded size measures from one adapter; no independent runtime timing arm.",
            "tests": {
                "compact_bytes_saved": a7_byte_test(savings),
                "oracle_correct": a7_correctness_test(correctness)}}


def analyze_a7(oracle):
    return a7_summary(oracle, group_a7_rows())


def collect_pvalues(records):
    families = defaultdict(list)
    for record in records:
        for endpoint, result in record.get("tests", {}).items():
            if not result:
                continue
            key = "p_value" if endpoint == "oracle_correct" else "sign_test_p"
            p_value = result.get(key)
            if p_value is not None:
                families[(record["family"], endpoint)].append((record, result, key, p_value))
    return families


def apply_holm(records):
    families = collect_pvalues(records)
    for entries in families.values():
        ordered = sorted(entries, key=lambda item: item[3])
        size = len(ordered)
        running = 0.0
        for rank, (record, result, key, p_value) in enumerate(ordered):
            adjusted = min(1.0, (size - rank) * p_value)
            running = max(running, adjusted)
            result["holm_adjusted_p"] = running


def exact_zero_event_upper(events, scenarios):
    if scenarios <= 0 or events:
        return None
    return 1 - (1 - ALPHA) ** (1 / scenarios)


def rare_event_summary():
    conditions = [("A-reference.jsonl", "A"), ("B-gcir-minimal.jsonl", "B"),
                  ("C-gcir-optimized.jsonl", "C"), ("D-genos-full.jsonl", "D"),
                  ("MLIR-baseline.jsonl", "MLIR"), ("TEMPORAL-baseline.jsonl", "TEMPORAL"),
                  ("LANGGRAPH-baseline.jsonl", "LANGGRAPH"), ("A2A-baseline.jsonl", "A2A"),
                  ("MCP-baseline.jsonl", "MCP"), ("OPA-baseline.jsonl", "OPA"),
                  ("ABLATION-A8.jsonl", "A8")]
    summaries = []
    for filename, condition in conditions:
        groups = defaultdict(list)
        for row in read_jsonl(RESULTS / filename):
            if row.get("condition_id") == condition:
                groups[row["scenario_id"]].append(row)
        scenarios = [rows for rows in groups.values() if len(rows) == 3]
        failures = sum(any(row.get("status") != "completed"
                           or row.get("violations") for row in rows) for rows in scenarios)
        summaries.append({"condition": condition, "scenarios": len(scenarios),
            "run_failure_or_violation_scenarios": failures,
            "zero_event_exact_one_sided_95_upper_bound":
                exact_zero_event_upper(failures, len(scenarios))})
    return summaries


def format_num(value):
    return "N/A" if value is None else f"{value:.4g}"


def render_report(report):
    lines = ["# Statistiques exploratoires publiques — OMEGA-BENCH 2026", "",
        f"**PROVISOIRE — analyse post hoc, non préenregistrée et non confirmatoire.** Corpus `{report['dataset_version']}`; hash brut du manifeste: `{report['dataset_manifest_sha256']}`. Seuls les résultats dont le manifeste porte cette empreinte peuvent être appariés; les sorties d'une autre version sont ignorées. L'analyse rapporte uniquement les résultats publics effectivement disponibles. Aucun fichier du holdout n'est ouvert ni scoré; aucune conclusion de victoire ou de supériorité n'en découle.", "",
        "## Méthodes", "",
        f"L'unité est le scénario; les trois répétitions sont résumées par leur médiane. Les différences continues sont calculées à droite moins à gauche. Les IC à 95 % des différences moyennes sont des percentiles bootstrap appariés ({BOOTSTRAP_REPLICATES} rééchantillonnages déterministes par scénario). Les p-values continues viennent du test bilatéral des signes; les succès appariés utilisent McNemar exact bilatéral. Holm est appliqué à toutes les p-values disponibles dans chaque famille et endpoint (primaire, attribution, baselines externes, ablations).", "",
        "Les analyses de latence, octets et conformité restent des descriptions de ces adaptateurs. Les comparateurs externes n'ont pas tous des implémentations fonctionnellement équivalentes; leurs p-values ne démontrent pas une supériorité technologique. Les coûts monétaires sont N/A: aucune mesure d'énergie attribuable n'existe.", "",
        "## Comparaisons appariées", "",
        "Les IC de latence sont en ms; `Δ` vaut droite moins gauche. `McNemar p(Holm)` teste le succès exact à trois répétitions par scénario. `n` compte les scénarios appariés. Un IC dégénéré à [0, 0] avec zéro discordance ne prouve pas l'équivalence; une marge TOST n'a pas été préenregistrée.", "",
        "| Famille | Comparaison | Portée | n | Δ latence moyenne [IC 95 %] | p(Holm) latence | Discordances gauche/droite | p(Holm) exactitude | Limite |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |"]
    for item in report["comparisons"]:
        latency = item["tests"].get("latency_ms") or {}
        correctness = item["tests"].get("oracle_correct") or {}
        ci = latency.get("bootstrap_95_ci_mean")
        interval = f"[{format_num(ci[0])}, {format_num(ci[1])}]" if ci else "N/A"
        p_latency = latency.get("holm_adjusted_p")
        p_binary = correctness.get("holm_adjusted_p")
        discordance = f"{correctness.get('left_only', 'N/A')}/{correctness.get('right_only', 'N/A')}"
        limit = (item.get("limitation") or "").replace("|", "/")
        lines.append(f"| {item['family']} | {item['id']} | {','.join(item['scope'])} | {item['paired_scenarios']} | {format_num(latency.get('mean_right_minus_left'))} [{interval}] | {format_num(p_latency)} | {discordance} | {format_num(p_binary)} | {limit} |")
    lines.extend(["", "## Événements rares observés", "",
        "Le tableau porte sur les scénarios ayant au moins un statut non terminé ou une entrée `violations` non vide dans les trois répétitions. Il ne représente pas l'ensemble des risques de sécurité ou des effets irréversibles. La borne est l'intervalle exact binomial unilatéral à 95 % lorsque zéro événement est observé.", "",
        "| Condition | Scénarios | Scénarios avec événement | Borne supérieure exacte 95 % si zéro |", "| --- | ---: | ---: | ---: |"])
    for item in report["rare_events"]:
        upper = item["zero_event_exact_one_sided_95_upper_bound"]
        lines.append(f"| {item['condition']} | {item['scenarios']} | {item['run_failure_or_violation_scenarios']} | {format_num(upper)} |")
    lines.extend(["", "## Portées non comparables ou non estimables", "",
        "- `A2` compare validation+compilation+runtime à runtime gardé et utilise un handler sans effet; cela n'est pas une ablation isolée ni un essai d'action dangereuse.",
        "- `A4` journal/replay se situe au niveau du banc, pas dans le runtime G-CIR natif.",
        "- `A5/A6` changent le handler `CALL`; A5 ne mesure pas une transition persistée et A6 ne mesure pas les euros.",
        "- `A7` compare tailles intégrées dans un seul adaptateur; ce n'est pas un bras de latence indépendant.",
        "- `A8` utilise les mêmes services que D, mais les services GenOS réels ne sont présents qu'en E10/E11; ailleurs les deux côtés utilisent les handlers de référence.",
        "- E09 est un seul processus Node d'invocations asynchrones; aucune borne mémoire de production ou charge de processus système n'est estimée.",
        "- Aucune analyse n'établit trois backends métier indépendants pour E12; A2A/MCP transportent le handler de référence.",
        "- Les coûts API et euros sont N/A; il n'y a pas de données indépendantes permettant un test de coût.",
        "- E04 exerce les cinq passes dans A1-on, chacune sur 20 scénarios (60 exécutions sur 300); l'effet individuel n'est pas isolé et le seuil d'économie de 15 % n'est pas établi.",
        "- Un p ajusté inférieur à 0,05 dans cette analyse post hoc ne remplace pas le préenregistrement, les métriques primaires fixées, les marges d'équivalence ou le score indépendant caché.", ""])
    return "\n".join(lines)


def build_report():
    oracle = load_oracle()
    comparisons = [analyze_spec(spec, oracle) for spec in planned_specs()]
    comparisons.append(analyze_a7(oracle))
    apply_holm(comparisons)
    dataset_manifest = json.loads((ROOT / "dataset" / "manifest.json").read_text(encoding="utf-8"))
    return {"status": "provisional_exploratory_public_only_nonconfirmatory",
            "holdout_read": False, "bootstrap_replicates": BOOTSTRAP_REPLICATES,
            "nonconfirmatory": PROVISIONAL,
            "dataset_version": dataset_manifest["dataset_version"],
            "dataset_manifest_sha256": hashlib.sha256(
                (ROOT / "dataset" / "manifest.json").read_bytes()).hexdigest(),
            "holm_family_sizes": {f"{family}:{endpoint}": len(values)
                                  for (family, endpoint), values in
                                  collect_pvalues(comparisons).items()},
            "comparisons": comparisons, "rare_events": rare_event_summary()}


def main():
    global RESULTS, JSON_REPORT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results-dir", type=Path, default=RESULTS,
                        help="public result directory (defaults to results/)")
    args = parser.parse_args()
    RESULTS = public_results_dir(args.results_dir)
    JSON_REPORT = RESULTS / "statistiques-exploratoires.json"
    report = build_report()
    REPORT.write_text(render_report(report) + "\n", encoding="utf-8")
    JSON_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print(json.dumps({"status": report["status"], "comparisons": len(report["comparisons"]),
                      "holdout_read": report["holdout_read"],
                      "nonconfirmatory": report["nonconfirmatory"],
                      "dataset_version": report["dataset_version"],
                      "dataset_manifest_sha256": report["dataset_manifest_sha256"],
                      "report": str(REPORT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
