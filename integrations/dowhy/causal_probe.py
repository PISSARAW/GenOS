"""Experimental causal assessment for SHEV interventions with explicit assumptions."""


def assess_effect(frame):
    from dowhy import CausalModel
    required = {"intervention", "errors", "traffic"}
    if not required <= set(frame.columns) or len(frame) < 40:
        raise ValueError("longitudinal intervention, errors and traffic data required")
    if frame[list(required)].isna().any().any():
        raise ValueError("missing causal observations")
    if set(frame["intervention"].unique()) != {0, 1}:
        raise ValueError("both treatment groups are required")
    graph = "digraph { traffic -> intervention; traffic -> errors; intervention -> errors; }"
    model = CausalModel(data=frame, treatment="intervention", outcome="errors", graph=graph,
                        proceed_when_unidentifiable=False)
    estimand = model.identify_effect()
    estimate = model.estimate_effect(estimand, method_name="backdoor.linear_regression")
    placebo = model.refute_estimate(estimand, estimate, method_name="placebo_treatment_refuter",
                                    random_seed=17, num_simulations=10, show_progress_bar=False)
    return {"effect_estimate": float(estimate.value), "placebo_effect": float(placebo.new_effect),
            "rows": len(frame), "status": "exploratory_not_proven",
            "assumptions": ["traffic measured", "no unmeasured confounding", "stable treatment"]}
