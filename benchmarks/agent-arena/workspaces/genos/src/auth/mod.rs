pub struct Authenticator;

impl Authenticator {
    pub fn new() -> Self {
        Authenticator {}
    }
}

impl Default for Authenticator {
    fn default() -> Self {
        Self::new()
    }
}