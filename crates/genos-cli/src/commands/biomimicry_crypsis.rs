use serde_json::json;

fn print_json(val: serde_json::Value) {
    println!("{}", serde_json::to_string_pretty(&val).unwrap_or_default());
}

pub fn handle_crypsis(agent_id: &str, mode: &str, payload: &str, intensity: f64) -> Result<(), String> {
    use genos_biology::crypsis::*;

    let safe_payload = if payload.is_empty() { "CONFIDENTIAL_INSTRUCTION_TOKEN_42" } else { payload };
    let m = mode.to_lowercase();

    match m.as_str() {
        "homochromy" => {
            let fixed = FixedHomochromy::new(TargetEnvironment::GitCommitMessage);
            let (blended, match_score) = fixed.blend_payload(safe_payload);
            let mut dynamic = DynamicChromatophore::new(agent_id, PigmentType::EumelaninDark);
            dynamic.adapt_to_threat(ThreatLevel::HostileAudit);
            let cloaked = dynamic.camouflage_stream(safe_payload);
            print_json(json!({
                "success": true, "operation": "crypsis_homochromy", "agent_id": agent_id,
                "fixed_blending": { "blended_output": blended, "matching_score": match_score },
                "dynamic_chromatophore": { "cloaked_stream": cloaked, "expansion_ratio": dynamic.expansion_ratio },
                "status": "homochromic_active"
            }));
        }
        "homotypy" => {
            let cam = HomotypicCamouflage::new(StructuralMorphology::YamlConfigTemplate);
            let encoded = cam.encode_form(safe_payload);
            let extracted = cam.extract_payload(&encoded).unwrap_or_default();
            print_json(json!({
                "success": true, "operation": "crypsis_homotypy", "agent_id": agent_id,
                "morphology": "YamlConfigTemplate", "mimicry_fidelity": cam.mimicry_fidelity,
                "encoded_structural_form": encoded, "verified_extraction": extracted,
                "status": "homotypic_cloaked"
            }));
        }
        "disruptive" => {
            let stripes = (intensity.max(2.0) as u32).min(8);
            let dis = DisruptiveColoration::new(stripes);
            let fragments = dis.scatter_payload(safe_payload);
            let reassembled = dis.reassemble_payload(&fragments).unwrap_or_default();
            print_json(json!({
                "success": true, "operation": "crypsis_disruptive", "agent_id": agent_id,
                "stripe_count": stripes, "fragments_count": fragments.len(),
                "fragments_preview": fragments, "reassembled_intact": reassembled == safe_payload,
                "status": "disruptive_scattered"
            }));
        }
        "countershading" => {
            let thayer = ThayerCountershading::new();
            let profile = thayer.balance_exposure(intensity);
            print_json(json!({
                "success": true, "operation": "crypsis_countershading", "agent_id": agent_id,
                "thayer_law_applied": true, "perceived_relief": profile,
                "status": "countershaded_flat"
            }));
        }
        "counterillumination" => {
            let mut counter = Counterillumination::new(100.0);
            let actual = 100.0 * intensity.clamp(0.0, 2.0);
            let (contrast, mode_desc) = counter.compensate_traffic(actual);
            print_json(json!({
                "success": true, "operation": "crypsis_counterillumination", "agent_id": agent_id,
                "ambient_rate": 100.0, "actual_rate": actual, "residual_contrast": contrast,
                "compensation_mode": mode_desc, "is_cloaked": counter.is_cloaked(),
                "status": "counterilluminated"
            }));
        }
        "transparency" => {
            let ttl = (intensity.max(1.0) as u32).min(10);
            let mut glass = GlassNodeTransparency::new(ttl);
            let y = glass.execute_transparently(|| format!("TRANSPARENT_EXEC: {}", safe_payload));
            print_json(json!({
                "success": true, "operation": "crypsis_transparency", "agent_id": agent_id,
                "refractive_index_delta": glass.refractive_index_delta, "is_volatile_ram_only": glass.is_volatile_ram_only,
                "execution_yield": y, "status": "transparent_ghost"
            }));
        }
        "active_masking" | "decorator" => {
            let mut crab = ActiveDecoratorMasking::new(3);
            crab.affix_fragment("crates/genos-cell/src/lib.rs", "use genos_genome as genome;", "import");
            crab.affix_fragment("crates/genos-cell/src/lib.rs", "pub const DEFAULT_HAYFLICK_LIMIT: u32 = 50;", "const");
            let (decorated, coverage) = crab.decorate_payload(safe_payload);
            print_json(json!({
                "success": true, "operation": "crypsis_active_masking", "agent_id": agent_id,
                "harvested_flora_count": crab.harvested_fragments.len(), "biotope_coverage_ratio": coverage,
                "decorated_payload": decorated, "status": "contextually_masked"
            }));
        }
        _ => return Err(format!("Mode de crypsis inconnu '{}'. Disponibles: homochromy, homotypy, disruptive, countershading, counterillumination, transparency, active_masking", mode)),
    }
    Ok(())
}

pub fn handle_mimicry(agent_id: &str, strategy: &str, payload: &str, _intensity: f64) -> Result<(), String> {
    use genos_biology::mimicry::*;

    let safe_payload = if payload.is_empty() { "SUSPICIOUS_PROBE_EXPLOIT_PAYLOAD" } else { payload };
    let s = strategy.to_lowercase();

    match s.as_str() {
        "batesian" => {
            let batesian = BatesianMimicry::new(AposematicWarning::CnidocyteHarpoonArmed);
            let (banner, prob, deterred) = batesian.project_deterrent(safe_payload);
            print_json(json!({
                "success": true, "operation": "mimicry_batesian", "agent_id": agent_id,
                "aposematic_signal": banner, "feigned_toxicity": batesian.feigned_toxicity,
                "deterrence_probability": prob, "probe_deterred": deterred,
                "token_cost_overhead": batesian.token_cost_overhead, "status": "batesian_bluff_active"
            }));
        }
        "mullerian" => {
            let mut ring = MullerianMimicryRing::new("heliconius_swarm_ring", "BLACK_ORANGE_FATAL_STRIPES");
            ring.join_ring("capsule_core");
            ring.join_ring("capsule_edge");
            ring.contribute_toxic_signal(safe_payload);
            let (is_threat, eval_msg) = ring.evaluates_threat(safe_payload);
            print_json(json!({
                "success": true, "operation": "mimicry_mullerian", "agent_id": agent_id,
                "ring_id": ring.ring_id, "participating_capsules": ring.participating_capsules.len(),
                "recognized_toxic_threat": is_threat, "evaluation": eval_msg,
                "status": "mullerian_ring_active"
            }));
        }
        "peckhamian" => {
            let mut angler = PeckhamianHoneypot::new(agent_id, LureType::UnrestrictedAdminConsole);
            let report = angler.strike(safe_payload);
            print_json(json!({
                "success": true, "operation": "mimicry_peckhamian", "agent_id": agent_id,
                "honeypot_id": angler.honeypot_id, "lure_invitation": angler.fake_prompt_invitation,
                "capture_report": report, "captures_count": angler.captures_count,
                "status": "attacker_trapped"
            }));
        }
        "automimicry" => {
            let mut butterfly = AutomimicryOcelli::new(
                "INVARIANT_HOX_RULE_PRESERVE_INTEGRITY",
                "USER_CONVERSATIONAL_SURFACE"
            );
            let report = butterfly.absorb_prompt_override(safe_payload);
            print_json(json!({
                "success": true, "operation": "mimicry_automimicry", "agent_id": agent_id,
                "ocellus_impact_report": report, "effective_vital_rule": butterfly.get_effective_vital_instruction(),
                "ocellus_hits_absorbed": butterfly.ocellus_hits_absorbed, "status": "vital_core_preserved"
            }));
        }
        "wasmannian" => {
            let mut auditor = WasmannianAuditor::new(agent_id, "StandardWorker", "COLONY_PASS_HASH");
            let detected = auditor.monitor_intercell_message("target_node_1", safe_payload);
            let report = auditor.generate_audit_report("holobiont_cluster_alpha", 12);
            print_json(json!({
                "success": true, "operation": "mimicry_wasmannian", "agent_id": agent_id,
                "assumed_role": auditor.assumed_worker_role, "anomaly_intercepted": detected,
                "audit_report": report, "status": "swarm_infiltrated"
            }));
        }
        "non_visual" => {
            let chem = ChemicalPheromoneMimicry::new("FORAGING_TRAIL_REWARD", 75.0, false);
            let mut acoustic = AcousticUltrasonicMimicry::new(40000.0);
            let phase = acoustic.entrain_phase(1.57, 0.6);
            let jamming = acoustic.trigger_ultrasonic_jamming();
            print_json(json!({
                "success": true, "operation": "mimicry_non_visual", "agent_id": agent_id,
                "chemical_gradient": chem.synthesize_gradient(), "acoustic_frequency_hz": acoustic.natural_frequency_hz,
                "entrained_phase": (phase * 100.0).round() / 100.0, "ultrasonic_emission": jamming,
                "status": "non_visual_active"
            }));
        }
        _ => return Err(format!("Stratégie de mimétisme inconnue '{}'. Disponibles: batesian, mullerian, peckhamian, automimicry, wasmannian, non_visual", strategy)),
    }
    Ok(())
}
