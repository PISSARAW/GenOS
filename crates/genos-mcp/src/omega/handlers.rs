use serde_json::Value;
use std::collections::HashMap;

use super::context::{Handler, OperationContext};

#[derive(Default)]
pub struct Handlers {
    pub readers: HashMap<String, Handler>,
    pub selectors: HashMap<String, Handler>,
    pub tools: HashMap<String, Handler>,
    pub inferers: HashMap<String, Handler>,
    pub verifiers: HashMap<String, Handler>,
    pub emitters: HashMap<String, Handler>,
}

impl Handlers {
    pub fn register_reader<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.readers.insert(reference.into(), Box::new(handler));
    }

    pub fn register_selector<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.selectors.insert(reference.into(), Box::new(handler));
    }

    pub fn register_tool<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.tools.insert(reference.into(), Box::new(handler));
    }

    pub fn register_inferer<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.inferers.insert(reference.into(), Box::new(handler));
    }

    pub fn register_verifier<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.verifiers.insert(reference.into(), Box::new(handler));
    }

    pub fn register_emitter<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.emitters.insert(reference.into(), Box::new(handler));
    }

    pub fn get_reader(&self, reference: &str) -> Option<&Handler> {
        self.readers.get(reference)
    }

    pub fn get_selector(&self, reference: &str) -> Option<&Handler> {
        self.selectors.get(reference)
    }

    pub fn get_tool(&self, reference: &str) -> Option<&Handler> {
        self.tools.get(reference)
    }

    pub fn get_inferer(&self, reference: &str) -> Option<&Handler> {
        self.inferers.get(reference)
    }

    pub fn get_verifier(&self, reference: &str) -> Option<&Handler> {
        self.verifiers.get(reference)
    }

    pub fn get_emitter(&self, reference: &str) -> Option<&Handler> {
        self.emitters.get(reference)
    }
}