class EpistemicData {
    constructor(config) {
        this.value = config.value;
        this.provenance = config.provenance;
        this.confidence = config.confidence;
        this.epistemic_state = config.epistemic_state;
        this.allowed_ops = config.allowed_ops || [];
        this.forbidden_ops = config.forbidden_ops || [];
    }
}

function evaluatePerception(epistemicData, intendedOperation) {
    if (epistemicData && typeof epistemicData === 'object' && 'epistemic_state' in epistemicData) {
        if (epistemicData.epistemic_state === 'INVALID') {
            throw new Error(`Etat epistemique INVALID pour la valeur "${epistemicData.value}"`);
        }
        if (epistemicData.forbidden_ops && epistemicData.forbidden_ops.includes(intendedOperation)) {
            throw new Error(`Operation "${intendedOperation}" interdite pour la valeur "${epistemicData.value}"`);
        }
    }
    return true;
}

module.exports = { EpistemicData, evaluatePerception };
