package omega

import rego.v1

default typing_valid := false

typing_valid if {
	input.candidate.schema == "genos.gcir.omega/v1"
	input.candidate.version == 1
	is_string(input.candidate.id)
	count(input.candidate.operations) == 1
	input.candidate.operations[0].kind == "READ"
	input.candidate.operations[0].state == "open"
}

default allowed := false

allowed if {
	input.policy[input.principal][_] == input.action
}
