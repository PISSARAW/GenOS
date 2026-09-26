use crate::orchestrator::BiomimeticOrchestrator;
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_biology::ecology::CollusionCheck;
use genos_cell::AgentCell;
use uuid::Uuid;

impl BiomimeticOrchestrator {
    pub fn create_tissue(
        &mut self,
        name: &str,
        function_role: &str,
    ) -> Result<&mut Tissue, String> {
        if self.tissues.contains_key(name) {
            return Err(format!("Tissu '{}' existe déjà", name));
        }
        if !self.active_cells.contains_key(&self.orchestrator_id) {
            return Err("La cellule souche de l'orchestrateur est introuvable".to_string());
        }
        let tissue = Tissue::new(name, function_role, self.orchestrator_id);
        self.tissues.insert(name.to_string(), tissue);
        self.tissues
            .get_mut(name)
            .ok_or_else(|| format!("Tissu '{}' introuvable après création", name))
    }

    pub fn add_worker(&mut self, tissue_name: &str, worker: AgentCell) -> Result<Uuid, String> {
        let worker_id = worker.cell_id;
        let tissue = self
            .tissues
            .get_mut(tissue_name)
            .ok_or_else(|| format!("Tissu '{}' introuvable", tissue_name))?;
        if self.active_cells.contains_key(&worker_id) {
            return Err(format!("Cellule {} déjà active", worker_id));
        }
        self.active_cells.insert(worker_id, worker);
        tissue.integrate_cell(worker_id);
        Ok(worker_id)
    }

    pub fn delegate_task(&self, tissue_name: &str, target: (Uuid, &str)) -> Result<String, String> {
        let (to_id, task) = target;
        let tissue = self
            .tissues
            .get(tissue_name)
            .ok_or_else(|| format!("Tissu '{}' introuvable", tissue_name))?;
        tissue.delegate_task(TaskDelegation {
            from_id: tissue.stem_cell_id,
            to_id,
            task,
        })
    }

    pub fn audit_collusion(
        &mut self,
        tissue_name: &str,
        audit: (&str, u32, bool),
    ) -> Result<String, String> {
        let (agent_id, consumed_tokens, physical_test_passed) = audit;
        let tissue = self
            .tissues
            .get_mut(tissue_name)
            .ok_or_else(|| format!("Tissu '{}' introuvable", tissue_name))?;
        let check = CollusionCheck {
            consumed_tokens,
            physical_test_passed,
        };
        tissue.ecology.enforce_anti_collusion(agent_id, check)
    }
}