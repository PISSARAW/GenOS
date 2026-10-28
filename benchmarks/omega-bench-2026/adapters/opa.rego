package omega

import rego.v1

default typing_valid := false

allowed_envelope_fields := {"schema", "version", "id", "operations", "policy", "payload"}
allowed_operation_fields := {"id", "kind", "reference", "dependsOn", "state"}
allowed_operation_kinds := {"READ", "SELECT", "CALL", "INFER", "CHECK", "EMIT"}

typing_valid if {
 candidate := input
 is_object(candidate)
 candidate.schema == "genos.gcir.omega/v1"
 candidate.version == 1
 is_string(candidate.id)
 count(candidate.id) > 0
 is_array(candidate.operations)
 count(candidate.operations) > 0
 count(candidate.operations) <= 64
 is_object(candidate.policy)
 valid_envelope_fields(candidate)
 valid_operations(candidate.operations)
 valid_policy(candidate.policy)
 valid_payload(candidate)
}

valid_envelope_fields(candidate) if {
 every key, _ in candidate { key in allowed_envelope_fields }
}

valid_operations(operations) if {
 every operation in operations { valid_operation(operation) }
}

valid_operation(operation) if {
 is_object(operation)
 is_string(operation.id)
 count(operation.id) > 0
 operation.kind in allowed_operation_kinds
 is_array(operation.dependsOn)
 every dependency in operation.dependsOn { is_string(dependency) }
 is_string(operation.state)
 valid_operation_reference(operation)
 every key, _ in operation { key in allowed_operation_fields }
}

valid_operation_reference(operation) if {
 not "reference" in object.keys(operation)
}

valid_operation_reference(operation) if {
 is_string(operation.reference)
}

valid_operation_reference(operation) if {
 is_null(operation.reference)
}

valid_policy(policy) if {
 every _, tools in policy {
  is_array(tools)
  every tool in tools { is_string(tool) }
 }
}

valid_payload(candidate) if {
 not "payload" in object.keys(candidate)
}

valid_payload(candidate) if {
 is_object(candidate.payload)
}

valid_payload(candidate) if {
 is_null(candidate.payload)
}

default allowed := false

allowed if {
	input.policy[input.principal][_] == input.action
}
