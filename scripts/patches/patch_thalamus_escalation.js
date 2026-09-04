const fs = require('fs');
let file = fs.readFileSync('crates/genos-core/src/cell/ribosome.rs', 'utf8');

file = file.replace(
    'let mut diff = "logic".to_string();',
    `let mut diff = "logic".to_string();
        if memory.len() > 3 {
            println!("🔥 [Thalamus] Escalade Cognitive (Conflit détecté, Historique lourd) -> Forçage du Tier: HEAVY !");
            diff = "heavy".to_string();
        }`
);

fs.writeFileSync('crates/genos-core/src/cell/ribosome.rs', file);
