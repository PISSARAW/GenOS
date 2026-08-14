use axum::{routing::get, Json, Router};
use serde::Serialize;

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

pub fn router() -> Router {
    Router::new().route("/health", get(health))
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}
