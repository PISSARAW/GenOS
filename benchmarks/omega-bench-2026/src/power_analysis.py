"""Calculate conservative planning values for paired scenario outcomes."""
import json
import math

from generate_dataset import COUNTS

HOLM_12_Z = 2.86
POWER_Z = {0.80: 0.842, 0.90: 1.282}
DISCORDANT_PAIR_RATE = 0.20


def paired_continuous_mde(sample_count, power, alpha_z=HOLM_12_Z):
    return (alpha_z + POWER_Z[power]) / math.sqrt(sample_count)


def paired_binary_required_n(effect, power, discordance=DISCORDANT_PAIR_RATE):
    if effect <= 0 or effect * effect >= discordance:
        raise ValueError("Effect must be positive and smaller than the discordant-pair rate.")
    numerator = alpha_component(discordance) + POWER_Z[power] * math.sqrt(discordance - effect * effect)
    return math.ceil((numerator / effect) ** 2)


def alpha_component(discordance, alpha_z=HOLM_12_Z):
    return alpha_z * math.sqrt(discordance)


def build_report():
    continuous = {}
    for experiment, sample_count in sorted(COUNTS.items()):
        continuous[experiment] = {
            "independent_scenarios": sample_count,
            "repetitions_per_condition": 3,
            "mde_standardized_80pct_power": round(paired_continuous_mde(sample_count, 0.80), 3),
            "mde_standardized_90pct_power": round(paired_continuous_mde(sample_count, 0.90), 3)
        }
    binary = {}
    for effect in (0.05, 0.10, 0.15):
        binary[str(effect)] = {
            str(power): paired_binary_required_n(effect, power)
            for power in POWER_Z
        }
    return {
        "method": "normal approximation for paired continuous outcomes and McNemar discordances",
        "primary_family_size": 12,
        "familywise_alpha": 0.05,
        "conservative_holm_first_step_z": HOLM_12_Z,
        "statistical_unit": "scenario; repetitions are repeated measures, not independent samples",
        "continuous_mde_by_experiment": continuous,
        "binary_assumption_discordant_pair_rate": DISCORDANT_PAIR_RATE,
        "binary_required_scenarios_by_absolute_difference": binary,
        "limitations": [
            "The paired discordance rate is a planning assumption; estimate it on development data before final lock.",
            "External-baseline and ablation comparisons form additional correction families and require a revised power calculation.",
            "Rare critical events require exact confidence bounds and may need more scenarios than this approximation."
        ]
    }


def main():
    print(json.dumps(build_report(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
