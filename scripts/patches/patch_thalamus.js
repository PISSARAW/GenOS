const fs = require('fs');
let file = fs.readFileSync('crates/genos-core/src/cell/ribosome.rs', 'utf8');

file = file.replace(
    'if name_lower.contains("gpt-4") || name_lower.contains("opus") || name_lower.contains("large") || name_lower.contains("pro") || name_lower.contains("70b") {',
    'if name_lower.contains("gpt-4") || name_lower.contains("opus") || name_lower.contains("large") || name_lower.contains("pro") || name_lower.contains("70b") || name_lower.contains("cloud") || name_lower.contains("glm") {'
);

fs.writeFileSync('crates/genos-core/src/cell/ribosome.rs', file);
