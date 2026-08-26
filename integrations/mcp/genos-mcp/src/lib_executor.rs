#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecutionOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[async_trait]
pub trait CommandExecutor: Send + Sync {
    async fn execute(&self, args: &[String]) -> anyhow::Result<ExecutionOutput>;
}

#[derive(Clone, Debug)]
pub struct GenosCliExecutor {
    executable: Option<PathBuf>,
    workspace_root: PathBuf,
    orchestrator_bridge: Option<PathBuf>,
}

impl GenosCliExecutor {
    pub fn discover() -> anyhow::Result<Self> {
        let workspace_root = env::var_os("GENOS_WORKSPACE_ROOT")
            .map(PathBuf::from)
            .unwrap_or(env::current_dir()?);
        let executable = env::var_os("GENOS_BIN")
            .map(PathBuf::from)
            .or_else(sibling_genos_binary);
        let orchestrator_bridge = env::var_os("GENOS_ORCHESTRATOR_BRIDGE")
            .map(PathBuf::from)
            .or_else(|| {
                let candidate = workspace_root.join("backend/bin/genos-orchestrate.cjs");
                candidate.is_file().then_some(candidate)
            });
        Ok(Self {
            executable,
            workspace_root,
            orchestrator_bridge,
        })
    }

    pub fn new(executable: impl Into<PathBuf>, workspace_root: impl Into<PathBuf>) -> Self {
        Self {
            executable: Some(executable.into()),
            workspace_root: workspace_root.into(),
            orchestrator_bridge: None,
        }
    }
}

#[async_trait]
impl CommandExecutor for GenosCliExecutor {
    async fn execute(&self, args: &[String]) -> anyhow::Result<ExecutionOutput> {
        let mut command = if args.first().map(String::as_str)
            == Some("__genos_backend_orchestrate__")
        {
            let bridge = self.orchestrator_bridge.as_ref()
                .ok_or_else(|| anyhow::anyhow!("backend/bin/genos-orchestrate.cjs was not found; set GENOS_ORCHESTRATOR_BRIDGE"))?;
            let mut node = Command::new("node");
            node.arg(bridge).args(&args[1..]);
            node
        } else {
            match &self.executable {
                Some(executable) => Command::new(executable),
                None => {
                    let mut cargo = Command::new("cargo");
                    cargo.args([
                        "run",
                        "--quiet",
                        "--manifest-path",
                        self.workspace_root
                            .join("Cargo.toml")
                            .to_string_lossy()
                            .as_ref(),
                        "-p",
                        "genos-cli",
                        "--",
                    ]);
                    cargo
                }
            }
        };
        let output = command
            .args(args)
            .current_dir(&self.workspace_root)
            .kill_on_drop(true)
            .output()
            .await?;
        Ok(ExecutionOutput {
            exit_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}

fn sibling_genos_binary() -> Option<PathBuf> {
    let current = env::current_exe().ok()?;
    let name = if cfg!(windows) { "genos.exe" } else { "genos" };
    let candidate = current.with_file_name(name);
    candidate.is_file().then_some(candidate)
}
