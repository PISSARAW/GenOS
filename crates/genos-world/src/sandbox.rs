use std::path::PathBuf;
use tokio::process::Command;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SandboxBackend {
    Bwrap,
    SandboxExec,
    GVisor,
    Firecracker,
    None,
}

impl Default for SandboxBackend {
    fn default() -> Self {
        SandboxBackend::None
    }
}

#[derive(Clone, Debug, Default)]
pub struct SandboxConfig {
    pub read_only_mounts: Vec<String>,
    pub writable_mounts: Vec<String>,
    pub network_enabled: bool,
    pub working_directory: Option<PathBuf>,
    pub backend: SandboxBackend,
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
        match config.backend {
            SandboxBackend::GVisor => Self::gvisor_command(config, program),
            SandboxBackend::Firecracker => Self::firecracker_command(config, program),
            SandboxBackend::Bwrap => Self::bwrap_command(config, program),
            SandboxBackend::SandboxExec => Self::sandbox_exec_command(config, program),
            SandboxBackend::None => {
                // Auto-detect based on OS
                if cfg!(target_os = "linux") {
                    Self::bwrap_command(config, program)
                } else if cfg!(target_os = "macos") {
                    Self::sandbox_exec_command(config, program)
                } else {
                    anyhow::bail!("no supported OS sandbox backend on this platform")
                }
            }
        }
    }

    fn bwrap_command(config: &SandboxConfig, program: &str) -> anyhow::Result<Command> {
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
        Ok(command)
    }

    fn sandbox_exec_command(config: &SandboxConfig, program: &str) -> anyhow::Result<Command> {
        let network = if config.network_enabled {
            "(allow network*)"
        } else {
            "(deny network*)"
        };
        let profile =
            format!("(version 1) (deny default) (allow process*) (allow file-read*) {network}");
        let mut command = Command::new("sandbox-exec");
        command.args(["-p", &profile, program]);
        Ok(command)
    }

    fn gvisor_command(config: &SandboxConfig, program: &str) -> anyhow::Result<Command> {
        let mut command = Command::new("runsc");
        command.arg("do");
        if !config.network_enabled {
            command.arg("--network=none");
        }
        for mount in &config.read_only_mounts {
            command.arg(format!("--bind={}:{}", mount, mount));
        }
        for mount in &config.writable_mounts {
            command.arg(format!("--bind={}:{}", mount, mount));
        }
        if let Some(dir) = &config.working_directory {
            command.arg(format!("--cwd={}", dir.to_string_lossy()));
        }
        command.arg("--").arg(program);
        Ok(command)
    }

    fn firecracker_command(config: &SandboxConfig, program: &str) -> anyhow::Result<Command> {
        // Basic integration using firectl as a representative wrapper for Firecracker
        let mut command = Command::new("firectl");
        if !config.network_enabled {
            command.args(["--tap-device=none"]);
        }
        // Firecracker usually expects a rootfs, so binding is more complex.
        // We simulate a minimal approach.
        for mount in &config.writable_mounts {
            command.arg(format!("--add-drive={},rw", mount));
        }
        // Pass program as kernel boot args or via an init script
        command
            .arg("--kernel-args")
            .arg(format!("init={} ", program));
        Ok(command)
    }
}
