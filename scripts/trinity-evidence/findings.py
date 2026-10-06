"""Inventory audit findings through references; never disclose raw answers/logs."""
import re
from causes import category
from sources import walk


FIELDS = {"issues", "warnings", "weakness", "acceptance", "improvements", "findings",
          "priorReportCorrections", "variantImprovements", "limits", "limitations",
          "conclusions", "review", "originalMissionViolation", "unknowns",
          "missing", "executionLimits", "claimsValidity", "scopeCompletion"}
LINK_FIELDS = {"refs", "references", "evidence", "qualityEvidence", "primaryCauseEvidence"}
EVIDENCE_ID = re.compile(r"^E\d+$")


def finding_records(document, catalog):
    result = []
    for pointer, value in walk(document.data):
        name = pointer.rsplit("/", 1)[-1]
        if name in FIELDS and value not in (None, [], {}, ""):
            result.append({"kind": name, "source": catalog.ref(document, pointer),
                           "category": category(value), "valueNotCopied": True,
                           "status": "reported_finding_not_independent_verification"})
    return result


def evidence_links(document):
    result = []
    for pointer, value in walk(document.data):
        if pointer.rsplit("/", 1)[-1] in LINK_FIELDS and isinstance(value, list):
            result.extend({"id": item, "pointer": pointer + "/" + str(index)}
                          for index, item in enumerate(value)
                          if isinstance(item, str) and EVIDENCE_ID.fullmatch(item))
    return result


def validate_links(document):
    return [row for row in evidence_links(document) if row["id"] not in document.reference_ids]


def leak_observations(document, catalog):
    result = []
    for index, case in enumerate(document.data["cases"]):
        for field in ("addedContract", "review", "conclusions", "verifierLimits", "scopeReview", "analysis"):
            for suffix, value in walk(case.get(field)):
                terms = leak_terms(value)
                if terms:
                    pointer = "/cases/" + str(index) + "/" + field + suffix
                    result.append({"caseId": case.get("caseId", case.get("id")),
                        "source": catalog.ref(document, pointer), "detectedTerms": terms,
                        "state": "audited_text_leak_suspected_requires_review",
                        "classification": "derived_from_audit_text_not_new_experiment"})
    return result


def leak_terms(value):
    if not isinstance(value, str):
        return []
    patterns = ("leak", "fuite", "contamin", "oracle public", "prédéfin", "pré-écr",
                "réponse imposée", "réponses prédéterminées", "priorité imposée",
                "contrat donne déjà", "contrat fournissait déjà", "expected",
                "probabilités attendues", "labels admissibles")
    return [term for term in patterns if term in value.lower()]
