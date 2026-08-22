//! Policy-bounded browser fetches and local Python execution.
use anyhow::{bail, Context, Result};
use reqwest::{redirect::Policy, Client, Url};
use std::{collections::BTreeSet, path::PathBuf, time::Duration};
use tokio::{process::Command, time::timeout};

#[derive(Clone, Debug)]
pub struct BrowserPolicy { pub allowed_hosts: BTreeSet<String>, pub max_response_bytes: usize, pub timeout: Duration }
impl BrowserPolicy {
    pub fn allows(&self, url: &Url) -> bool { matches!(url.scheme(), "https" | "http") && url.host_str().is_some_and(|host| self.allowed_hosts.contains(host)) }
}
pub struct BrowserTool { client: Client, policy: BrowserPolicy }
impl BrowserTool {
    pub fn new(policy: BrowserPolicy) -> Result<Self> { Ok(Self { client: Client::builder().redirect(Policy::none()).timeout(policy.timeout).build()?, policy }) }
    pub async fn fetch_text(&self, address: &str) -> Result<String> {
        let url = Url::parse(address).context("parsing browser URL")?;
        if !self.policy.allows(&url) { bail!("browser policy forbids URL host or scheme"); }
        let response = self.client.get(url).send().await?.error_for_status()?;
        let bytes = response.bytes().await?;
        if bytes.len() > self.policy.max_response_bytes { bail!("browser response exceeds policy size limit"); }
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }
}

#[derive(Clone, Debug)]
pub struct PythonPolicy { pub working_dir: PathBuf, pub timeout: Duration, pub max_output_bytes: usize, pub enabled: bool }
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PythonResult { pub stdout: String, pub stderr: String, pub success: bool }
pub struct PythonInterpreter { policy: PythonPolicy }
impl PythonInterpreter {
    pub fn new(policy: PythonPolicy) -> Self { Self { policy } }
    pub async fn execute(&self, source: &str) -> Result<PythonResult> {
        if !self.policy.enabled { bail!("Python execution is disabled by policy"); }
        if !self.policy.working_dir.is_dir() { bail!("Python working directory does not exist"); }
        let child = Command::new("python3").arg("-I").arg("-c").arg(source).current_dir(&self.policy.working_dir).env_clear().env("PYTHONIOENCODING", "utf-8").output();
        let output = timeout(self.policy.timeout, child).await.map_err(|_| anyhow::anyhow!("Python execution timed out"))??;
        if output.stdout.len() + output.stderr.len() > self.policy.max_output_bytes { bail!("Python output exceeds policy size limit"); }
        Ok(PythonResult { stdout: String::from_utf8_lossy(&output.stdout).into_owned(), stderr: String::from_utf8_lossy(&output.stderr).into_owned(), success: output.status.success() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_policy_only_allows_declared_hosts() {
        let policy = BrowserPolicy { allowed_hosts: BTreeSet::from(["docs.example.test".into()]), max_response_bytes: 10, timeout: Duration::from_secs(1) };
        assert!(policy.allows(&Url::parse("https://docs.example.test/a").unwrap()));
        assert!(!policy.allows(&Url::parse("https://evil.example.test/a").unwrap()));
    }
    #[tokio::test]
    async fn python_interpreter_obeys_enable_policy() {
        let interpreter = PythonInterpreter::new(PythonPolicy { working_dir: std::env::temp_dir(), timeout: Duration::from_secs(1), max_output_bytes: 100, enabled: false });
        assert!(interpreter.execute("print('no')").await.is_err());
    }
}
