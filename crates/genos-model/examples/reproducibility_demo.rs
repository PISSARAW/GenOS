use genos_model::{FakeModel, ModelProvider, ModelRequest, RandomModel};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let request = ModelRequest {
        provider: "demo".to_string(),
        model: "test".to_string(),
        prompt: "INPUT A".to_string(),
        temperature: Some(1.0),
    };

    let fake = FakeModel::new().infer(request.clone()).await?;
    let seed_42_a = RandomModel::new(42).infer(request.clone()).await?;
    let seed_42_b = RandomModel::new(42).infer(request.clone()).await?;
    let seed_99 = RandomModel::new(99).infer(request).await?;

    println!("FakeModel:       {}", fake.content);
    println!("RandomModel(42): {}", seed_42_a.content);
    println!("RandomModel(42): {}", seed_42_b.content);
    println!("RandomModel(99): {}", seed_99.content);
    assert_eq!(seed_42_a.content, seed_42_b.content);
    assert_ne!(seed_42_a.content, seed_99.content);
    Ok(())
}
