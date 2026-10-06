"""Generate a compact, reproducible L1 historical registry from sealed audits."""
import argparse
import hashlib
import json
from pathlib import Path
from adapters import attempt_record, case_record, context, worker_record
from findings import finding_records, leak_observations, validate_links
from mission_criteria import criteria_for
from sources import Catalog, confined, digest, mission_seal, sealed_audits
from validation import EXPECTED, validate


DEFAULT_LAB = Path("D:/GenOS-Trinity-qualification-20261006-01a1109a")
MANIFEST_SHA = "c7bcf8ab4c786173aba0e7b9fc12ea4dc53ff2ecf024ab55c40b9c69a7fde6b4"
SCHEMA = "genos.trinity-historical-registry/v1"


def append_attempt(item, location, payload):
    case, raw, ctx = location
    attempt = attempt_record(raw, ctx)
    attempt.update({"caseId": case["caseId"], "variant": case["variant"]})
    refused = attempt["causes"]["primary"]["category"] == "diversity_below_threshold"
    attempt["compositionRefused"] = case["variant"] == "heterogeneous" and refused
    workers_key = attempt.pop("workersKey")
    for index, world in enumerate(raw.get(workers_key, [])):
        worker_ctx = context(item[0], item[1], item[2] + "/" + workers_key + "/" + str(index))
        worker = worker_record(world, worker_ctx)
        worker["workerId"] = attempt["attemptId"] + ":" + str(worker["worldNumber"])
        worker.update({"attemptId": attempt["attemptId"], "caseId": case["caseId"],
                       "variant": case["variant"]})
        payload["workers"].append(worker)
        attempt["workers"].append(worker["workerId"])
    case["attemptIds"].append(attempt["attemptId"])
    payload["attempts"].append(attempt)


def append_document(document, catalog, payload):
    mission_map = {row["id"]: row for row in payload["_missionSource"]}
    for missing in validate_links(document):
        payload["unresolvedReferences"].append({"reportedId": missing["id"],
            "source": catalog.ref(document, missing["pointer"]), "state": "unknown"})
    for index, raw in enumerate(document.data["cases"]):
        identifier = raw.get("caseId", raw.get("id"))
        pointer = "/cases/" + str(index)
        ctx = context(catalog, document, pointer)
        case = case_record(raw, mission_map[identifier], ctx)
        for number, attempt in enumerate(raw["attempts"]):
            attempt_pointer = pointer + "/attempts/" + str(number)
            actx = context(catalog, document, attempt_pointer)
            append_attempt((catalog, document, attempt_pointer), (case, attempt, actx), payload)
        payload["missions"].append(case)
    payload["findings"].extend(finding_records(document, catalog))
    payload["answerLeakObservations"].extend(leak_observations(document, catalog))


def build_registry(config):
    catalog = Catalog()
    documents = sealed_audits(config["auditRoot"], catalog, config.get("manifestSha256", MANIFEST_SHA))
    mission_doc = catalog.load(config["missions"], mission_seal(documents))
    mission_doc.label = "missions"
    payload = {"missions": [], "attempts": [], "workers": [], "findings": [],
               "answerLeakObservations": [], "unresolvedReferences": [],
               "_missionSource": mission_doc.data["missions"]}
    for document in documents:
        append_document(document, catalog, payload)
    payload["references"] = catalog.references
    payload["referenceAliases"] = {doc.label: doc.reference_ids for doc in documents}
    enrich_originals(payload, (catalog, mission_doc))
    payload["validation"] = validate(payload, catalog, config.get("expected", EXPECTED))
    payload["sources"] = [{"document": doc.label, "path": str(doc.path),
        "sha256": doc.sha256, "bytes": doc.path.stat().st_size,
        "anchor": "external_manifest_required" if doc.label == "manifest" else "sealed_source_hash"}
        for doc in catalog.documents]
    payload["validation"]["recordedReferences"] = len(catalog.references)
    payload["validation"]["sourceReferenceOccurrences"] = sum(
        len(ref["reportedBy"]) for ref in catalog.references.values())
    payload["generatorSources"] = generator_sources()
    catalog.unchanged()
    return payload


def generator_sources():
    directory = Path(__file__).resolve().parent
    return [{"path": str(path), "sha256": digest(path), "role": "authored_registry_or_criterion_proposal"}
            for path in sorted(directory.glob("*.py"))]


def enrich_originals(payload, inputs):
    catalog, document = inputs
    originals = {row["id"]: index for index, row in enumerate(document.data["missions"])}
    for case in payload["missions"]:
        source = catalog.ref(document, "/missions/" + str(originals[case["caseId"]]) + "/mission")
        enrich_original(case, source)


def enrich_original(case, source):
    case["originalSource"] = source
    case["originalTextSha256"] = hashlib.sha256(case["originalText"].encode("utf-8")).hexdigest()
    mission = {"id": case["caseId"]}
    case["proposedMissionCriteria"] = criteria_for(mission, source)
    link_clause_criteria(case)


def link_clause_criteria(case):
    identifiers = [row["criterionId"] for row in case["proposedMissionCriteria"]]
    for clause in case["originalClauses"]:
        clause["source"] = case["originalSource"]
        clause["criterion"] = {"proposalRefs": identifiers,
          "scope": "whole_original_mission", "clauseMappingApproval": "human_review_required"}
        clause["verifierRef"] = {"proposalId": "manual_independent_review_required",
          "approved": False, "criterionRefs": identifiers}


def output_root(config):
    output = Path(config["output"]).resolve()
    audit = Path(config["auditRoot"]).resolve()
    inputs = [audit, Path(config["missions"]).resolve()]
    for source in inputs:
        if output == source or source in output.parents or output in source.parents:
            raise ValueError("Output overlaps protected source input")
    return output


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            + "\n").encode("utf-8")


def registry_index(payload):
    entries = [{"path": name + ".json", "sha256": hashlib.sha256(encoded(value)).hexdigest(),
                "bytes": len(encoded(value))} for name, value in payload.items()]
    index = {"schema": SCHEMA, "files": entries, "counts": payload["validation"]["counts"],
             "contractProfile": "documentary_registry_not_active_approved_contract",
             "privacy": "No worker prompts, raw reports, logs, environments, DBs or secrets copied",
             "limitations": ["Local hashes attest bytes, not authenticity of producers.",
               "Manifest must be pinned separately to resist coordinated rewriting of all inputs.",
               "External reference hashes are reported, not reverified.",
               "Historical fixture PASS is neither semantic qualification nor promotion.",
               "Original clauses require human criteria and independent proofs.",
               "Primary means audit-reported first symptom; root cause remains unproven."]}
    return index


def write_registry(payload, config):
    output = output_root(config)
    output.mkdir(parents=True, exist_ok=True)
    index = registry_index(payload)
    for name, value in {**payload, "index": index}.items():
        target = confined(output, name + ".json")
        temporary = confined(output, name + ".json.tmp")
        temporary.write_bytes(encoded(value))
        temporary.replace(target)
    return index


def verify_output(payload, config):
    output = output_root(config)
    expected = {**payload, "index": registry_index(payload)}
    for name, value in expected.items():
        if confined(output, name + ".json").read_bytes() != encoded(value):
            raise ValueError("Registry differs from sealed source reconstruction: " + name)
    return {"verified": True, "files": len(expected), "counts": payload["validation"]["counts"]}


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--audit-root", type=Path, default=DEFAULT_LAB / "audit-approfondi-20261006")
    result.add_argument("--missions", type=Path, default=DEFAULT_LAB / "missions.json")
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--manifest-sha256", default=MANIFEST_SHA)
    result.add_argument("--verify-output", action="store_true")
    return result


def main():
    args = parser().parse_args()
    config = {"auditRoot": args.audit_root, "missions": args.missions, "output": args.output,
              "manifestSha256": args.manifest_sha256}
    output_root(config)
    payload = build_registry(config)
    if args.verify_output:
        print(json.dumps(verify_output(payload, config)))
        return 0
    index = write_registry(payload, config)
    print(json.dumps({"output": str(Path(config["output"]).resolve()), "counts": index["counts"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
