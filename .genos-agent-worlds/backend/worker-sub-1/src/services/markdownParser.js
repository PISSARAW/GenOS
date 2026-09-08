function parseMarkdownAST(text) {
    if (typeof text !== 'string') return [];
    
    const lines = text.split('\n');
    const nodes = [];
    
    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
            nodes.push({
                type: 'heading',
                level: match[1].length,
                text: match[2].trim()
            });
        } else {
            nodes.push({
                type: 'text',
                content: line
            });
        }
    }
    
    return nodes;
}

module.exports = { parseMarkdownAST };
