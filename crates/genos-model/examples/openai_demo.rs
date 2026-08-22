use genos_model::factory::ModelFactory;
use genos_model::{GenerationConfig, Message, Role};
use std::env;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Attempt to read the API key from environment
    let api_key = match env::var("OPENAI_API_KEY") {
        Ok(key) => key,
        Err(_) => {
            println!("Error: OPENAI_API_KEY environment variable is not set.");
            println!("Please set it before running this demo.");
            println!("Example: $env:OPENAI_API_KEY=\"sk-...\"");
            return Ok(());
        }
    };

    let config = GenerationConfig {
        temperature: Some(0.7),
        max_tokens: Some(50),
        ..Default::default()
    };

    let messages = vec![Message {
        role: Role::User,
        content: "What is the capital of France? Answer in one word.".to_string(),
        tool_call_id: None,
    }];

    println!("Instantiating OpenAI Adapter...");
    // Create the provider via the factory
    let provider = ModelFactory::create("openai://gpt-4o-mini", Some(api_key))?;

    println!("Sending request to OpenAI...");
    let response = provider.generate(&messages, &config).await?;

    println!("--- Response ---");
    println!("Content: {:?}", response.content);
    println!("Latency: {} ms", response.usage.latency_ms);
    println!(
        "Tokens used: {} (prompt: {}, completion: {})",
        response.usage.total_tokens, response.usage.prompt_tokens, response.usage.completion_tokens
    );

    Ok(())
}
