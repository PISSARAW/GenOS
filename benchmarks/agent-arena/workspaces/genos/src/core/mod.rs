pub struct Middleware;

impl Middleware {
    pub fn new() -> Self {
        Middleware {}
    }
}

impl Default for Middleware {
    fn default() -> Self {
        Self::new()
    }
}