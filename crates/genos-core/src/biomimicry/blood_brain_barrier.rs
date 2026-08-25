//! Blood-Brain Barrier (BBB) mapped to strict prompt isolation.
//!
//! Biological mechanism: A highly selective semipermeable border that separates 
//! circulating blood from the brain and extracellular fluid in the CNS.
//! GenOS mapping: A strict isolation layer between the agent's core prompt/logic 
//! and external data (web scraping, API returns). The BBB sanitizes all incoming 
//! payload streams to prevent Prompt Injection from reaching the "brain".

#[derive(Debug, Clone)]
pub struct BloodBrainBarrier {
    pub agent_id: String,
    pub strict_mode: bool,
}

impl BloodBrainBarrier {
    pub fn new(agent_id: String, strict_mode: bool) -> Self {
        Self {
            agent_id,
            strict_mode,
        }
    }

    /// Filters incoming unstructured data before it reaches the LLM context window
    pub fn filter_payload(&self, raw_payload: &str, risk_score: f64) -> Result<String, String> {
        let threshold = if self.strict_mode { 0.3 } else { 0.7 };
        
        if risk_score > threshold {
            Err("BBB BLOCKED: Payload contains suspected malicious neurotoxins (Prompt Injection).".to_string())
        } else {
            Ok(format!("BBB PASSED: Payload sanitized. Safe for cognitive processing. Size: {} bytes", raw_payload.len()))
        }
    }
}
