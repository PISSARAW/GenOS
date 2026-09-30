use crate::GenosEcosystem;
use crate::genos_store::FossilRecord;
use serde_json::{Value, json};

fn reproduction_history(ecosystem: &GenosEcosystem, lineage_id: &str) -> Vec<Value> {
    ecosystem
        .events
        .read_stream(0)
        .into_iter()
        .filter(|event| event.event_type == "AUTONOMOUS_REPRODUCTION")
        .filter(|event| event.payload["schema"] == "genos.reproduction-event/v1")
        .filter(|event| event.payload["lineage_id"].as_str() == Some(lineage_id))
        .map(|event| event.payload)
        .collect()
}

impl GenosEcosystem {
    /// Fossilise une lignée uniquement si son historique contient des reçus versionnés.
    pub fn fossilize_lineage_with_provenance(
        &mut self,
        lineage_id: &str,
        reason: &str,
    ) -> Result<FossilRecord, String> {
        let history = reproduction_history(self, lineage_id);
        if history.is_empty() {
            return Err("versioned reproduction history is required before fossilization".into());
        }
        let record = self.fossils.fossilize(lineage_id, reason);
        self.record_event(
            "LINEAGE_FOSSILIZED",
            json!({
                "schema": "genos.lineage-fossilization/v1",
                "lineage_id": lineage_id,
                "parent_seed_mutation_fingerprints": history,
                "fossil_id": record.fossil_id,
                "fossil_payload_hash": record.payload_hash,
                "reason": reason
            }),
        );
        Ok(record)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genos_cell::AgentCell;

    #[test]
    fn fossilization_requires_and_preserves_versioned_lineage_provenance() {
        let mut ecosystem = GenosEcosystem::new("lineage-archive");
        assert!(ecosystem.fossilize_lineage_with_provenance("unknown", "extinct").is_err());
        ecosystem.orchestrator.create_tissue("Arena", "Exec").unwrap();
        let cell_id = ecosystem
            .orchestrator
            .add_worker("Arena", AgentCell::new("founder", "w", "Soma"))
            .unwrap();
        let genome_id = ecosystem.seed_germline(cell_id, "FOUNDER_GENOME").unwrap();
        let lineage_id = ecosystem.orchestrator.genomes[&genome_id].lineage_id().to_string();
        ecosystem.feed(100.0);
        ecosystem.autonomous_reproduction_cycle().unwrap();

        let fossil = ecosystem
            .fossilize_lineage_with_provenance(&lineage_id, "lineage ended")
            .unwrap();
        let event = ecosystem.read_events(0).into_iter().find(|entry| entry.event_type == "LINEAGE_FOSSILIZED").unwrap();
        assert_eq!(event.payload["schema"], "genos.lineage-fossilization/v1");
        assert_eq!(event.payload["fossil_id"], fossil.fossil_id.to_string());
        assert!(event.payload["parent_seed_mutation_fingerprints"][0]["seed"].is_string());
        assert!(event.payload["parent_seed_mutation_fingerprints"][0]["fingerprints"]["daughter"]["content_hash"].is_string());
    }
}
