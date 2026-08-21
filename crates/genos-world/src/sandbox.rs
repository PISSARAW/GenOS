pub struct SandboxConfig {
    pub read_only_mounts: Vec<String>,
}

pub trait Sandbox {
    // 2 paramètres (self inclus)
    fn setup_env(&self, config: &SandboxConfig) -> anyhow::Result<()>;
}
