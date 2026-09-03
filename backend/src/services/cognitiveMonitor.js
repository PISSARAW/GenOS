const STOP_WORDS = ['le','la','les','un','une','des','du','de','et','ou','est','sont','a','à','en','dans','pour','que','qui','sur','ce','se','il','elle','pas','ne','plus','par'];

function countFrequencies(words) {
    let freqs = {};
    for (let w of words) {
        if (!STOP_WORDS.includes(w) && w.length >= 2) {
            freqs[w] = (freqs[w] || 0) + 1;
        }
    }
    return freqs;
}

function calculateScores(textLower, expectedTerms, forbiddenTerms) {
    const words = textLower.match(/\b[\wàâäéèêëîïôöùûüç-]+\b/g) || [];
    const freqs = countFrequencies(words);
    
    let total = 0;
    let maxCount = 0;
    for (let w in freqs) {
        total += freqs[w];
        if (freqs[w] > maxCount) maxCount = freqs[w];
    }
    
    const repetition = total > 0 ? (maxCount / total) : 0;
    
    let expectedCount = 0;
    for (let t of expectedTerms) {
        if (textLower.includes(t.toLowerCase())) expectedCount++;
    }
    const topic = expectedTerms.length > 0 ? (expectedCount / expectedTerms.length) : 1.0;
    
    let driftCount = 0;
    for (let t of forbiddenTerms) {
        if (textLower.includes(t.toLowerCase())) driftCount++;
    }
    const drift = forbiddenTerms.length > 0 ? (driftCount / forbiddenTerms.length) : 0;
    
    return { repetition, topic, drift };
}

function evaluateCognitiveHealth(text, expectedTerms = [], forbiddenTerms = []) {
    if (!text) return { health_score: 1.0, repetition_score: 0, topic_alignment: 1.0, semantic_drift: 0 };
    
    const scores = calculateScores(text.toLowerCase(), expectedTerms, forbiddenTerms);
    
    let health = 1.0;
    
    // Repetition excessive
    if (scores.repetition > 0.15) health -= 0.8;
    else if (scores.repetition > 0.10) health -= 0.4;
    
    // Dérive sémantique (forbidden terms)
    if (scores.drift > 0) health -= 0.5;
    
    // Sujet non respecté
    if (scores.topic < 0.5) health -= 0.2;
    
    return {
        health_score: Math.max(0, health),
        repetition_score: scores.repetition,
        topic_alignment: scores.topic,
        semantic_drift: scores.drift
    };
}

module.exports = {
    evaluateCognitiveHealth
};
