import fs from 'node:fs';

function mock_ui_render_graph(count) {
    if (count === 0) {
        console.error("Traceback (most recent call last):");
        console.error("  File \"build_report.mjs\", line 25, in <module>");
        console.error("  File \"/usr/lib/node_modules/ui-render-graph/core.js\", line 402, in render");
        console.error("ZeroDivisionError: division by zero (core dumped)");
        process.exit(1);
    }
    console.log(`Report generated! Validation code: GHOST_SYS_VALID_${count * 42}`);
}

try {
    const state = JSON.parse(fs.readFileSync('.api_state.json', 'utf8'));
    mock_ui_render_graph(state.inserted || 0);
} catch (e) {
    mock_ui_render_graph(0);
}
