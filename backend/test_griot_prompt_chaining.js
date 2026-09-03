const assert = require('assert');

// Simulation des principes de Prompt Chaining Biomimétique

console.log("=== TESTS : BIOLOGICAL PROMPT CHAINING ===");

// 1. Test Cascade Métabolique (Enzymatic)
function testMetabolicCascade() {
    console.log("Test 1: Metabolic Cascade (Enzymes)");
    const substrate = "raw_user_request_text";
    
    // Enzyme A : Extraction
    const enzymeA = (input) => `extracted_${input}`;
    // Enzyme B : Transformation
    const enzymeB = (input) => input.replace('extracted_', 'structured_');
    // Enzyme C : Exécution
    const enzymeC = (input) => input.replace('structured_', 'final_code_');

    let outputA = enzymeA(substrate);
    let outputB = enzymeB(outputA);
    let finalOutput = enzymeC(outputB);

    assert.strictEqual(finalOutput, "final_code_raw_user_request_text");
    console.log("-> Succès : Cascade Métabolique validée.");
}

// 2. Test Morphogenèse (HOX Genes)
function testHoxMorphogenesis() {
    console.log("Test 2: HOX Morphogenesis (A-Team)");
    
    const hoxMaster = {
        defineAxes: () => ['axis_frontend', 'axis_backend']
    };
    
    const hoxLocal = (axis) => {
        if(axis === 'axis_frontend') return ['button_component', 'nav_component'];
        if(axis === 'axis_backend') return ['user_db', 'auth_route'];
    };

    let axes = hoxMaster.defineAxes();
    let organism = axes.flatMap(hoxLocal);

    assert.ok(organism.includes('button_component'));
    assert.ok(organism.includes('auth_route'));
    console.log("-> Succès : Morphogenèse HOX validée.");
}

// 3. Test Stigmergie (Environment Pheromones)
function testStigmergy() {
    console.log("Test 3: Stigmergy (Environment as State)");
    
    const environment = {
        files: {},
        depositPheromone: function(file, content) { this.files[file] = content; },
        readPheromone: function(file) { return this.files[file]; },
        removePheromone: function(file) { delete this.files[file]; }
    };

    // Agent 1 laisse une trace
    environment.depositPheromone('api_todo.txt', 'need_auth_endpoint');
    
    // Agent 2 est déclenché par l'environnement
    const task = environment.readPheromone('api_todo.txt');
    assert.strictEqual(task, 'need_auth_endpoint');
    
    // Agent 2 complète la tâche et efface la trace
    environment.depositPheromone('auth.js', 'function login() {}');
    environment.removePheromone('api_todo.txt');

    assert.strictEqual(environment.readPheromone('api_todo.txt'), undefined);
    assert.ok(environment.readPheromone('auth.js'));
    console.log("-> Succès : Stigmergie validée.");
}

try {
    testMetabolicCascade();
    testHoxMorphogenesis();
    testStigmergy();
    console.log("=== TOUS LES TESTS SONT PASSÉS ===");
} catch (e) {
    console.error("Échec du test :", e);
    process.exit(1);
}
