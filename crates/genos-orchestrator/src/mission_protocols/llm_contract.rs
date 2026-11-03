//! Contraintes textuelles exactes, sans prétention de vérité de la prose.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const MAX_ARTIFACT_BYTES: u64 = 1_048_576;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TextContract {
    pub min_bytes: u64,
    pub max_bytes: u64,
    pub required: Vec<String>,
    pub forbidden: Vec<String>,
    pub semantic_requirements: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContractVerdict {
    pub method_id: String,
    pub structural_passed: bool,
    pub passed: bool,
    pub unresolved: Vec<String>,
    pub violations: Vec<String>,
}

#[derive(Clone, Copy)]
pub enum VerificationMethod { Direct, ByteScan }

impl VerificationMethod {
    pub fn method_id(self) -> &'static str {
        match self { Self::Direct => "rust_str_contains/v1", Self::ByteScan => "rust_byte_windows/v1" }
    }
}

impl TextContract {
    pub fn validate(&self) -> Result<(), String> {
        if self.min_bytes == 0 || self.min_bytes > self.max_bytes || self.max_bytes > MAX_ARTIFACT_BYTES {
            return Err("LLM_CONTRACT_BYTE_LIMIT_INVALID".into());
        }
        validate_terms(&self.required)?;
        validate_terms(&self.forbidden)?;
        validate_terms(&self.semantic_requirements)?;
        if self.required.iter().any(|term| self.forbidden.contains(term)) {
            return Err("LLM_CONTRACT_LITERAL_CONTRADICTION".into());
        }
        Ok(())
    }
}

fn validate_terms(terms: &[String]) -> Result<(), String> {
    if terms.len() > 64 { return Err("LLM_CONTRACT_TOO_MANY_TERMS".into()); }
    let mut seen = HashSet::new();
    for term in terms {
        if term.is_empty() || term.len() > 4096 || !seen.insert(term) {
            return Err("LLM_CONTRACT_EMPTY_OVERSIZED_OR_DUPLICATE_TERM".into());
        }
    }
    Ok(())
}

pub fn verify(text: &str, contract: &TextContract) -> Result<[ContractVerdict; 2], String> {
    contract.validate()?;
    Ok([direct(text, contract), byte_scan(text, contract)])
}

pub fn verify_method(text: &str, contract: &TextContract, method: VerificationMethod) -> Result<ContractVerdict, String> {
    contract.validate()?;
    Ok(match method {
        VerificationMethod::Direct => direct(text, contract),
        VerificationMethod::ByteScan => byte_scan(text, contract),
    })
}

fn direct(text: &str, contract: &TextContract) -> ContractVerdict {
    let mut violations = Vec::new();
    let size = text.len() as u64;
    if size < contract.min_bytes || size > contract.max_bytes { violations.push("byte_length".into()); }
    for (index, literal) in contract.required.iter().enumerate() {
        if !text.contains(literal) { violations.push(format!("required:{index}")); }
    }
    for (index, literal) in contract.forbidden.iter().enumerate() {
        if text.contains(literal) { violations.push(format!("forbidden:{index}")); }
    }
    verdict("rust_str_contains/v1", contract, violations)
}

fn byte_scan(text: &str, contract: &TextContract) -> ContractVerdict {
    let bytes = text.as_bytes();
    let mut violations = Vec::new();
    let size = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
    if !(contract.min_bytes..=contract.max_bytes).contains(&size) { violations.push("byte_length".into()); }
    for (index, literal) in contract.required.iter().enumerate() {
        if !contains_bytes(bytes, literal.as_bytes()) { violations.push(format!("required:{index}")); }
    }
    for (index, literal) in contract.forbidden.iter().enumerate() {
        if contains_bytes(bytes, literal.as_bytes()) { violations.push(format!("forbidden:{index}")); }
    }
    verdict("rust_byte_windows/v1", contract, violations)
}

fn contains_bytes(text: &[u8], literal: &[u8]) -> bool {
    text.windows(literal.len()).any(|window| window == literal)
}

fn verdict(method: &str, contract: &TextContract, violations: Vec<String>) -> ContractVerdict {
    let structural_passed = violations.is_empty();
    ContractVerdict {
        method_id: method.into(), structural_passed,
        passed: structural_passed && contract.semantic_requirements.is_empty(),
        unresolved: contract.semantic_requirements.clone(), violations,
    }
}
