use std::{path::PathBuf, process::Command};

#[derive(Clone, Debug)]
pub struct SandboxConfig {
    pub read_only_mounts: Vec<String>,
    pub writable_mounts: Vec<String>,
    pub network_enabled: bool,
    pub working_directory: Option<PathBuf>,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            read_only_mounts: vec![],
            writable_mounts: vec![],
            network_enabled: false,
            working_directory: None,
        }
    }
}

pub trait Sandbox {
    // 2 paramètres (self inclus)
    fn setup_env(&self, config: &SandboxConfig) -> anyhow::Result<()>;
}

/// Builds a command using a real OS isolation backend. The call fails closed
/// if no supported backend is installed, preventing accidental unsandboxed
/// execution when network isolation was requested.
pub struct OsSandbox;
impl OsSandbox {
    pub fn command(config: &SandboxConfig, program: &str) -> anyhow::Result<Command> {
        if cfg!(target_os = "linux") {
            let mut command = Command::new("bwrap");
            command.args(["--die-with-parent", "--new-session"]);
            if !config.network_enabled {
                command.arg("--unshare-net");
            }
            for mount in &config.read_only_mounts {
                command.args(["--ro-bind", mount, mount]);
            }
            for mount in &config.writable_mounts {
                command.args(["--bind", mount, mount]);
            }
            if let Some(dir) = &config.working_directory {
                command.args(["--chdir", dir.to_string_lossy().as_ref()]);
            }
            command.arg("--").arg(program);
            return Ok(command);
        }
        if cfg!(target_os = "macos") {
            let network = if config.network_enabled {
                "(allow network*)"
            } else {
                "(deny network*)"
            };
            let profile =
                format!("(version 1) (deny default) (allow process*) (allow file-read*) {network}");
            let mut command = Command::new("sandbox-exec");
            command.args(["-p", &profile, program]);
            return Ok(command);
        }
        anyhow::bail!("no supported OS sandbox backend on this platform")
    }
}
