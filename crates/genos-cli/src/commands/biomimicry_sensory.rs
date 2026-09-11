use crate::args::BiomimicrySubcommands;

pub fn handle_sensory_subcommands(cmd: BiomimicrySubcommands) -> Result<bool, String> {
    match cmd {
        BiomimicrySubcommands::Vomeronasal { agent_id, locus, pheromone_type, concentration, sensitivity } => {
            let params = vec![
                format!("agent_id={}", agent_id),
                format!("locus={}", locus),
                format!("pheromone_type={}", pheromone_type),
                format!("concentration={}", concentration),
                format!("sensitivity={}", sensitivity),
            ];
            crate::commands::biomimicry_features::handle_bio_feature("vomeronasal", "emit_and_detect", &params);
            Ok(true)
        }
        BiomimicrySubcommands::Electrosensory { agent_id, action, frequency_hz, sensitivity, distortion_threshold, samples } => {
            let params = vec![
                format!("agent_id={}", agent_id),
                format!("frequency_hz={}", frequency_hz),
                format!("sensitivity={}", sensitivity),
                format!("distortion_threshold={}", distortion_threshold),
                format!("samples={}", samples),
            ];
            crate::commands::biomimicry_features::handle_bio_feature("electrosensory", &action, &params);
            Ok(true)
        }
        BiomimicrySubcommands::ClusterN { agent_id, action, sensitivity, tolerance_deg, goal_vector, current_vector } => {
            let params = vec![
                format!("agent_id={}", agent_id),
                format!("sensitivity={}", sensitivity),
                format!("tolerance_deg={}", tolerance_deg),
                format!("goal_vector={}", goal_vector),
                format!("current_vector={}", current_vector),
            ];
            crate::commands::biomimicry_features::handle_bio_feature("cluster_n", &action, &params);
            Ok(true)
        }
        _ => Ok(false),
    }
}
