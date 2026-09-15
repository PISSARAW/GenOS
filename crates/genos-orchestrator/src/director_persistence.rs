//! Persistance réelle de l'expérience apprise par le directeur (Phase 4).
//!
//! `Director`/`Learner` sont sérialisables ; ces méthodes les persistent sur
//! disque via le coffre de snapshots existant, afin que l'expérience survive
//! à un redémarrage du processus et se transfère réellement aux missions
//! suivantes (pas seulement une continuité en mémoire tant que le processus
//! tourne).

use crate::director::DirectorState;
use crate::ecosystem::GenosEcosystem;
use uuid::Uuid;

impl GenosEcosystem {
    /// Persiste l'expérience apprise du directeur (stats, bandits contextuels,
    /// paramètres organisationnels) sur disque, dans le coffre de snapshots.
    pub fn save_director_state(&mut self, dir: impl Into<std::path::PathBuf>) -> Result<Uuid, String> {
        if !self.snapshots.is_open() {
            self.snapshots.open(dir)?;
        }
        let payload = serde_json::to_value(self.director.export_state())
            .map_err(|error| error.to_string())?;
        self.snapshots.save("director", "learning", payload)
    }

    /// Recharge la dernière expérience persistée du directeur, si elle
    /// existe. Retourne `true` si une expérience a effectivement été
    /// rechargée (transfert réel entre missions, y compris après
    /// redémarrage), `false` si le coffre est vide (premier démarrage).
    pub fn load_latest_director_state(
        &mut self,
        dir: impl Into<std::path::PathBuf>,
    ) -> Result<bool, String> {
        if !self.snapshots.is_open() {
            self.snapshots.open(dir)?;
        }
        let latest = self
            .snapshots
            .list_by_agent("director")
            .into_iter()
            .max_by(|(_, a), (_, b)| a.created_at.cmp(&b.created_at));
        match latest {
            Some((_, manifest)) => {
                let payload = manifest
                    .payload
                    .clone()
                    .ok_or_else(|| "snapshot du directeur sans charge utile".to_string())?;
                let state: DirectorState =
                    serde_json::from_value(payload).map_err(|error| error.to_string())?;
                self.director.import_state(state);
                Ok(true)
            }
            None => Ok(false),
        }
    }
}
