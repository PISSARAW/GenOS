const fs = require('fs');
let file = fs.readFileSync('crates/genos-core/src/cell/ribosome.rs', 'utf8');

file = file.replace(
    'let clean = content.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();',
    `let start = content.find('{').unwrap_or(0);
                    let end = content.rfind('}').map(|i| i + 1).unwrap_or(content.len());
                    let clean = &content[start..end];`
);

fs.writeFileSync('crates/genos-core/src/cell/ribosome.rs', file);
