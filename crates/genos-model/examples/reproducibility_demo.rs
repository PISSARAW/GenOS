use genos_model::factory::ModelFactory;
use genos_model::{GenerationConfig, Message, Role};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = GenerationConfig {
        temperature: Some(1.0),
        ..Default::default()
    };
    
    let messages = vec![Message {
        role: Role::User,
        content: "INPUT A".to_string(),
        tool_call_id: None,
    }];

    let fake = ModelFactory::create("fake://test", None)?;
    let random_42_a = ModelFactory::create("random://42", None)?;
    let random_42_b = ModelFactory::create("random://42", None)?;
    let random_99 = ModelFactory::create("random://99", None)?;
    let openai_stub = ModelFactory::create("openai://gpt-4o", None)?;

    let fake_res = fake.generate(&messages, &config).await?;
    let r42a_res = random_42_a.generate(&messages, &config).await?;
    let r42b_res = random_42_b.generate(&messages, &config).await?;
    let r99_res = random_99.generate(&messages, &config).await?;
    let openai_res = openai_stub.generate(&messages, &config).await?;

    println!("FakeModel:       {:?}", fake_res.content);
    println!("RandomModel(42): {:?}", r42a_res.content);
    println!("RandomModel(42): {:?}", r42b_res.content);
    println!("RandomModel(99): {:?}", r99_res.content);
    println!("OpenAiAdapter:   {:?}", openai_res.content);
    
    assert_eq!(r42a_res.content, r42b_res.content);
    assert_ne!(r42a_res.content, r99_res.content);
    
    Ok(())
}
