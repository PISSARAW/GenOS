use crate::kernel_cycle::{ControlKernel, KernelMissionReport};
use crate::kernel_runtime_verifier::MissionVerification;

impl ControlKernel {
    /// Promeut le rapport uniquement depuis une vérification durable produite
    /// par le lecteur SQLite indépendant du runtime Node.
    pub fn verified_report(
        &self,
        verification: &MissionVerification,
    ) -> Result<KernelMissionReport, String> {
        verification.require_verified()?;
        let mut report = self.mission_report();
        report.verified = true;
        report.agents_used = verification.worker_ids().to_vec();
        report.evidence.extend(verification.evidence().iter().cloned());
        report.independent_verification = Some(verification.clone());
        Ok(report)
    }
}
