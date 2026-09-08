/**
 * Output Governor Service
 * Purifies raw LLM text by enforcing output contracts.
 */

function enforceOutputContract(rawText, contractOpts = {}) {
    if (!rawText || typeof rawText !== 'string') {
        return '';
    }

    let purified = rawText.trim();

    if (contractOpts.stripPreamble) {
        // Cherche le premier --- (frontmatter) ou # (titre) en début de ligne
        const match = purified.match(/(^|\n)(---|# )/);
        
        if (match) {
            purified = purified.slice(match.index).trim();
        }
    }

    if (contractOpts.stripPostamble) {
        // Enlève les bavardages courants à la fin du texte (sans flag 's' pour ne matcher que la dernière ligne)
        const postambleRegex = /\n+.*(N'hésitez pas|J'espère|Voici|Bien sûr|Merci).*$/i;
        purified = purified.replace(postambleRegex, '').trim();
    }

    return purified;
}

module.exports = {
    enforceOutputContract
};
