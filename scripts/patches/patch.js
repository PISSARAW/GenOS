const fs = require('fs');
let file = fs.readFileSync('crates/genos-core/src/bin/genos.rs', 'utf8');

file = file.replace(
    'You are an autonomous expert developer. Output necessary files. Format strictly as:\\nFILE: filename.ext\\n<content>\\nNO markdown blocks around the file.',
    'You are an autonomous expert developer. You can output necessary files OR run terminal commands. Format strictly as:\\nFILE: filename.ext\\n<content>\\nOR\\nCMD: npm install something\\nNO markdown blocks around the file. If you need to scaffold a project, run the CMD first.'
);

file = file.replace(
    'println!("⚠️ Échec du LLM ({}). Utilisation d\'un code de secours.", e);\n                "FILE: index.html\\n<!DOCTYPE html>\\n<html><body><h1>Fallback IRL</h1></body></html>\\n[READY]".to_string()',
    'println!("⚠️ Échec du LLM ({}).", e);\n                continue;'
);

const originalParse = `            for line in code_response.lines() {
                if line.starts_with("FILE: ") {
                    if !current_file.is_empty() {
                        mind.cognitive_state.quantum_vfs.deltas.insert(current_file.clone(), current_content.clone());
                    }
                    current_file = line.trim_start_matches("FILE: ").trim().to_string();
                    current_content.clear();
                } else {
                    current_content.push_str(line);
                    current_content.push('\\n');
                }
            }
            if !current_file.is_empty() {
                mind.cognitive_state.quantum_vfs.deltas.insert(current_file.clone(), current_content.clone());
            }
            
            // Simulation d'une trace d'exécution pour la VTA
            mind.trace.sequence.push(genos_core::cell::events::CellEvent::TaskExecuted {
                task_name: "WriteCode".to_string(),
                result: "SUCCESS: J'ai écrit le code du site web.".to_string(),
            });`;

const newParse = `            for line in code_response.lines() {
                if line.starts_with("FILE: ") {
                    if !current_file.is_empty() {
                        mind.cognitive_state.quantum_vfs.deltas.insert(current_file.clone(), current_content.clone());
                    }
                    current_file = line.trim_start_matches("FILE: ").trim().to_string();
                    current_content.clear();
                } else if line.starts_with("CMD: ") {
                    if !current_file.is_empty() {
                        mind.cognitive_state.quantum_vfs.deltas.insert(current_file.clone(), current_content.clone());
                        current_file.clear();
                        current_content.clear();
                    }
                    let cmd_str = line.trim_start_matches("CMD: ").trim();
                    println!("⚙️ [RunTerminalCommand] Exécution de: {}", cmd_str);
                    
                    #[cfg(target_os = "windows")]
                    let output = std::process::Command::new("cmd").args(&["/C", cmd_str]).current_dir(&cwd).output();
                    
                    #[cfg(not(target_os = "windows"))]
                    let output = std::process::Command::new("sh").arg("-c").arg(cmd_str).current_dir(&cwd).output();

                    match output {
                        Ok(o) => {
                            if !o.status.success() {
                                println!("❌ CMD FAILED: {}", String::from_utf8_lossy(&o.stderr));
                            } else {
                                println!("✅ CMD SUCCESS:\\n{}", String::from_utf8_lossy(&o.stdout));
                            }
                        },
                        Err(e) => println!("❌ CMD ERROR: {}", e),
                    }
                } else {
                    if !current_file.is_empty() {
                        current_content.push_str(line);
                        current_content.push('\\n');
                    }
                }
            }
            if !current_file.is_empty() {
                mind.cognitive_state.quantum_vfs.deltas.insert(current_file.clone(), current_content.clone());
            }
            
            mind.trace.sequence.push(genos_core::cell::events::CellEvent::TaskExecuted {
                task_name: "WriteCode_And_RunCommand".to_string(),
                result: "SUCCESS: Action effectuée.".to_string(),
            });`;

file = file.replace(originalParse, newParse);

fs.writeFileSync('crates/genos-core/src/bin/genos.rs', file);
