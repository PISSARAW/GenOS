"""Pending obligations, never fabricated evidence or completed requirements."""
import re


COMMON = (
    ("original_scope", "Vérifier toutes les contraintes de la mission originale, séparément de la fixture."),
    ("typed_report", "Valider le report worker réel, ses claims, sa provenance et ses limites."),
    ("independent_evidence", "Obtenir les preuves indépendantes requises, avec identité et digests attestés."),
    ("accounting", "Distinguer estimation, usage fournisseur, cache et facturation; conserver les inconnus."),
    ("promotion", "Tracer comparaison, validité mondiale et promotion séparément du PASS local."),
)
VARIANTS = {
    "controlled": "Comparer trois recettes scellées sur les mêmes entrées et vérifier les justifications.",
    "heterogeneous": "Prévalider une diversité réelle et démontrer trois mécanismes exécutés distincts.",
    "factorial": "Exécuter tous les facteurs déclarés, réplications et routes observées; recalculer effets/interactions.",
    "pareto": "Vérifier toutes les dominances et compromis, contraintes et directions des objectifs sans faux gagnant.",
    "adversarial": "Tracer une objection indépendante liée à une claim, la réponse et l’arbitrage.",
    "counterfactual": "Attester intervention, conditions communes, replay et différence causale contrôlée.",
    "temporal": "Valider ordre, horizons, transitions d’état et contradictions temporelles.",
    "oracular": "Sceller les prédictions avant observation et vérifier outcomes/calibration sans autorité de promotion.",
    "jury": "Valider admission, anonymat, votes indépendants, abstention et adjudication.",
    "recursive": "Exécuter les descendants, tracer budgets/parenté et merge vérifié des preuves.",
    "adaptive": "Relier adaptation observée aux critères mesurés, limites et contrôle sans adaptation.",
    "exploratory": "Vérifier contraintes négatives et scénarios d’usage, puis découverte réellement évaluée.",
}


def case_obligations(case, source):
    rows = list(COMMON)
    rows.append(("variant_mechanism", VARIANTS[case["variant"]]))
    return [{"id": key, "description": text, "status": "pending",
             "source": source, "evidence": []} for key, text in rows]


def addition_selector(case, group):
    keys = {"controlled-factorial": "addedContract",
            "adversarial-temporal": "scopeReview", "jury-recursive": "analysis"}
    return "/" + keys[group]


def original_clauses(mission, source):
    """Lossless segmentation; offsets are Python Unicode code-point offsets."""
    text = mission["mission"]
    ends = [match.end() for match in re.finditer(r"[;!?\n]|\.(?=\s|$)", text)]
    if not ends or ends[-1] != len(text):
        ends.append(len(text))
    clauses = []
    start = 0
    for number, end in enumerate(ends, 1):
        identifier = mission["id"] + ":original:" + str(number)
        clauses.append({"requirementId": identifier, "text": text[start:end],
                        "start": start, "end": end, "source": source,
                        "criterion": None, "criterionStatus": "human_review_required",
                        "verifierRef": None, "proofRefs": [], "status": "unknown"})
        start = end
    return clauses
