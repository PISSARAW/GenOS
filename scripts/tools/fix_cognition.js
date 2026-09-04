const fs = require('fs');
let file = fs.readFileSync('crates/genos-core/src/cell/cognition.rs', 'utf8');

file = file.replace(
`        self.stress_level = (self.stress_level + token_pressure + time_pressure).min(1.0); 
    pub fn relax(&mut self) {`,
`        self.stress_level = (self.stress_level + token_pressure + time_pressure).min(1.0); 
    }
    
    pub fn relax(&mut self) {`
);

fs.writeFileSync('crates/genos-core/src/cell/cognition.rs', file);
