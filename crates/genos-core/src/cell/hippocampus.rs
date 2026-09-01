use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Hippocampus {
    pub short_term_memory: Vec<ChatMessage>,
}

impl Hippocampus {
    pub fn new() -> Self {
        Self {
            short_term_memory: Vec::new(),
        }
    }

    pub fn memorize(&mut self, role: &str, content: &str) {
        self.short_term_memory.push(ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
        });
    }

    pub fn clear(&mut self) {
        self.short_term_memory.clear();
    }
}
