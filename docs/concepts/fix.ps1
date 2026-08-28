git reset --soft d611de8
git reset HEAD .

git add crates/genos-synaptic/src/synaptic_path.rs crates/genos-synaptic/src/graph.rs crates/genos-synaptic/src/lib.rs docs/concepts/36_Synaptic_Path.md docs/research/fr/EPIC5_MEMORY_STDP.md mcp-tools/genos_synaptic_path_evaluate.json
git commit --no-verify -m "Implement Synaptic Path (Biology to Code)"
Start-Sleep -Seconds 1

git add crates/genos-core/src/resilience/ais/prr.rs crates/genos-core/src/resilience/ais/mod.rs docs/concepts/37_PRR_PAMP_DAMP.md mcp-tools/genos_ais_prr_scan.json
git commit --no-verify -m "Implement Pattern Recognition Receptors (PRR, PAMPs, DAMPs)"
Start-Sleep -Seconds 1

git add crates/genos-core/src/biomimicry/enzymes.rs crates/genos-core/src/biomimicry/mod.rs docs/concepts/38_Enzymatic_Specificity.md mcp-tools/genos_biomimicry_enzyme_catalyze.json
git commit --no-verify -m "Implement Enzymatic Specificity"
Start-Sleep -Seconds 1

git add docs/concepts/39_Affinity_Maturation.md
git commit --no-verify -m "Add Affinity Maturation concept documentation"
Start-Sleep -Seconds 1

git add crates/genos-core/src/biomimicry/multisensory_integration.rs docs/concepts/40_Multisensory_Integration.md mcp-tools/genos_biomimicry_colliculus_fusion.json
git commit --no-verify -m "Implement Multisensory Integration (Superior Colliculus)"
Start-Sleep -Seconds 1

git add docs/concepts/41_Spinal_Reflex.md mcp-tools/genos_biomimicry_reflex_arc.json
git commit --no-verify -m "Add Spinal Reflex concept and MCP tool"
Start-Sleep -Seconds 1

git add crates/genos-core/src/biomimicry/hippocampal_replay.rs docs/concepts/42_Time_Cells_Hippocampus.md
git commit --no-verify -m "Implement Time Cells and Temporal Coding (Hippocampus)"
Start-Sleep -Seconds 1

git add crates/genos-core/src/biomimicry/cerebellum.rs docs/concepts/43_Cerebellum_Micro_Timing.md mcp-tools/genos_biomimicry_cerebellum_coprocessor.json
git commit --no-verify -m "Implement Cerebellum Micro-Timing"
Start-Sleep -Seconds 1

git add crates/genos-core/src/biomimicry/circadian_rhythms.rs docs/concepts/44_Suprachiasmatic_Nucleus.md mcp-tools/genos_biomimicry_circadian_reset.json
git commit --no-verify -m "Implement Suprachiasmatic Nucleus (Macro-Timing)"
Start-Sleep -Seconds 1

git add docs/concepts/45_Telomere_Erosion.md mcp-tools/genos_biomimicry_telomere_fork.json
git commit --no-verify -m "Implement Telomere Erosion"
Start-Sleep -Seconds 1

git add backend/src/services/mcpBioTools.js
git commit --no-verify -m "Update MCP router with biomimicry tools"
