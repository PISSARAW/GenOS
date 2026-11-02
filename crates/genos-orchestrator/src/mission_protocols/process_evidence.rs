use super::{Binding, Computation, ProcessReceipt, WorkerRole};
use std::collections::HashSet;

#[derive(Clone, Debug)]
pub struct ProcessEvidence {
    producer: ProcessReceipt,
    verifier_a: ProcessReceipt,
    verifier_b: ProcessReceipt,
    result: Computation,
}

impl ProcessEvidence {
    pub fn collect(binding: &Binding, input: ([ProcessReceipt; 3], Option<i64>)) -> Result<Self, String> {
        let ([producer, verifier_a, verifier_b], expected_sum) = input;
        let result = producer.result()?;
        if expected_sum.is_some_and(|sum| sum != result.sum) { return Err("NATIVE_EXPECTED_SUM_REFUTED".into()); }
        let evidence = Self { producer, verifier_a, verifier_b, result };
        evidence.assert_binding(binding)?;
        Ok(evidence)
    }

    pub fn assert_binding(&self, binding: &Binding) -> Result<(), String> {
        let mut pids = HashSet::new();
        let mut operations = HashSet::new();
        for (receipt, role) in self.receipts().into_iter().zip([
            WorkerRole::Producer, WorkerRole::VerifierA, WorkerRole::VerifierB]) {
            receipt.assert_binding(binding)?;
            if receipt.role() != role || !pids.insert(receipt.pid())
                || !operations.insert(receipt.operation_id()) || receipt.output() != self.producer.output()
                || receipt.input_hash() != self.source_hash() || receipt.context_hash() != self.context_hash()
                || receipt.decoded_input_hash() != self.producer.decoded_input_hash() {
                return Err("NATIVE_INDEPENDENT_PROOF_DISAGREEMENT".into());
            }
        }
        Ok(())
    }
    pub fn source_hash(&self) -> &str { &self.result.source_hash }
    pub fn result_hash(&self) -> &str { self.producer.output_hash() }
    pub fn context_hash(&self) -> &str { self.producer.context_hash() }
    pub fn result(&self) -> &Computation { &self.result }
    pub fn receipts(&self) -> [&ProcessReceipt; 3] {
        [&self.producer, &self.verifier_a, &self.verifier_b]
    }
}
