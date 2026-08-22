const fs = require('fs');

// Pré-calcul Statique Parfait (Parent B) - Ordre ciblant les coins en premier (5x5)
const EVAL_ORDER = [
    0, 4, 20, 24, // Coins
    1, 2, 3, 5, 9, 10, 14, 15, 19, 21, 22, 23, // Bords
    6, 8, 16, 18, // Coins intérieurs
    7, 11, 13, 17, // Bords intérieurs
    12 // Centre
];

const TIMEOUT_MS = 29500; // 29.5s
const START_TIME = Date.now();

let bestScore = -Infinity;
let bestGrid = new Int32Array(25);
let nodesEvaluated = 0;

// Micro-optimisation Bitwise (Parent C)
function solve(index, usedBits, currentGrid) {
    nodesEvaluated++;

    if ((Date.now() - START_TIME) > TIMEOUT_MS) {
        return true; // Timeout strict
    }

    if (index === 25) {
        let score = evaluateGrid(currentGrid);
        if (score > bestScore) {
            bestScore = score;
            saveBest(currentGrid, score);
        }
        return false;
    }

    let pos = EVAL_ORDER[index];

    for (let val = 0; val < 25; val++) {
        let bit = 1 << val;
        if ((usedBits & bit) === 0) {
            currentGrid[pos] = val;
            let timeout = solve(index + 1, usedBits | bit, currentGrid);
            if (timeout) return true;
        }
    }

    return false;
}

// Fonction d'évaluation (complexité réduite)
function evaluateGrid(grid) {
    let score = 0;
    // Maximiser une fonction de distance simple pour le test
    for (let i = 0; i < 24; i++) {
        let diff = grid[i] - grid[i + 1];
        score += diff > 0 ? diff : -diff;
    }
    return score;
}

// Sauvegarde sans dépasser 3 paramètres
function saveBest(grid, score) {
    for (let i = 0; i < 25; i++) {
        bestGrid[i] = grid[i];
    }
    
    let content = `Best Score: ${score}\nGrid:\n`;
    for (let row = 0; row < 5; row++) {
        let rowStr = "";
        for (let col = 0; col < 5; col++) {
            let val = bestGrid[row * 5 + col].toString().padStart(2, '0');
            rowStr += val + " ";
        }
        content += rowStr.trim() + "\n";
    }
    
    fs.writeFileSync('results/gen0_child_v3.txt', content);
}

// Lancement
function run() {
    console.log("[Status] Initialisation child_solver_v3.js");
    console.log("[Status] Gènes chargés : Pré-calcul Statique (B) & Bitwise (C)");
    
    let grid = new Int32Array(25);
    solve(0, 0, grid);
    
    let duration = (Date.now() - START_TIME) / 1000;
    let nodesPerSec = Math.floor(nodesEvaluated / duration);
    
    console.log("\n=== MÉTRIQUES DE FIN ===");
    console.log(`Statut : Terminé (Timeout de 29.5s géré)`);
    console.log(`Temps écoulé : ${duration.toFixed(2)}s`);
    console.log(`Noeuds évalués : ${nodesEvaluated}`);
    console.log(`Vitesse : ${nodesPerSec} noeuds/sec`);
    console.log(`Meilleur score : ${bestScore}`);
    console.log("Grille sauvegardée dans gen0_child_v3.txt");
}

run();
