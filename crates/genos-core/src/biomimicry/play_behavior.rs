//! Play Behavior mapped to protected zero-stakes exploration.
//!
//! Biological mechanism: Young mammals engage in "play" (mock fighting, exploration)
//! which costs energy but develops crucial motor and cognitive skills for unexpected situations.
//! GenOS mapping: Agents are allocated a "Play Budget". During Play, the agent is
//! encouraged to hallucinate, combine random tools, and explore without being penalized
//! for failing the main objective. Found capabilities are saved to the genome.

#[derive(Debug, Clone)]
pub struct PlayBehavior {
    pub agent_id: String,
    pub play_budget: u64,
    pub is_active: bool,
}

impl PlayBehavior {
    pub fn new(agent_id: String, play_budget: u64) -> Self {
        Self {
            agent_id,
            play_budget,
            is_active: false,
        }
    }

    /// Initiates a play session, effectively ignoring standard loss functions
    pub fn initiate_play(&mut self) -> Result<String, String> {
        if self.play_budget == 0 {
            return Err("Play budget exhausted.".to_string());
        }
        self.is_active = true;
        Ok(
            "Play session started. Objective functions disabled. High temp exploration active."
                .to_string(),
        )
    }

    /// Ends the play session and logs any serendipitous discoveries
    pub fn conclude_play(&mut self, tokens_spent: u64, discoveries: usize) -> String {
        self.is_active = false;
        self.play_budget = self.play_budget.saturating_sub(tokens_spent);
        format!(
            "Play session concluded. {} tokens spent. {} serendipitous skills discovered.",
            tokens_spent, discoveries
        )
    }
}
