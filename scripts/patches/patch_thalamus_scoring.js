const fs = require('fs');
let file = fs.readFileSync('crates/genos-core/src/cell/ribosome.rs', 'utf8');

file = file.replace(
    'BANNED DISADVANTAGES (pick 0 to 2): ["refusal_rate", "hallucinates_on_numbers", "slow"]',
    'BANNED DISADVANTAGES (pick 0 to 2): ["refusal_rate", "hallucinates_on_numbers", "slow", "ignores_commands"]'
);

file = file.replace(
    'if prof.advantages.contains(adv) { score += 5; }',
    'if prof.advantages.contains(adv) { score += 15; }'
);

fs.writeFileSync('crates/genos-core/src/cell/ribosome.rs', file);
