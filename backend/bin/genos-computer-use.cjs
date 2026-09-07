const { generate } = require("../src/services/modelProvider");
const { runGenosSync } = require("../src/services/genosCli");

async function runComputerUseLoop(mission) {
    console.log(`Starting Computer Use Mission: ${mission}`);
    
    let iterations = 0;
    while (iterations < 15) {
        iterations++;
        console.log(`\n--- Iteration ${iterations} ---`);
        
        // 1. Capture screen
        console.log("Capturing screen...");
        let base64Image;
        try {
            const out = runGenosSync("genos desktop capture").toString();
            const payload = JSON.parse(out);
            if (!payload.success) throw new Error(payload.error);
            base64Image = payload.base64;
        } catch (e) {
            console.error("Failed to capture screen:", e.message);
            break;
        }

        // 2. Build prompt
        const prompt = [
            { type: "image", source: { type: "base64", media_type: "image/png", data: base64Image } },
            { type: "text", text: `Mission: ${mission}\n\nObserve the screen and use the computer tool to make progress.` }
        ];

        // 3. Call model
        console.log("Thinking...");
        const result = await generate({
            model: process.env.GENOS_DEFAULT_MODEL || "anthropic://claude-3-5-sonnet-20241022",
            prompt,
            stream: false
        });

        const text = result.text;
        console.log("Model responded.");

        // 4. Parse Tool Calls
        let toolCall = null;
        try {
            // Anthropic tool block stringified in modelProvider
            if (text.includes("\"type\":\"tool_use\"")) {
                const lines = text.split("\n");
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.type === "tool_use" && parsed.name === "computer") {
                            toolCall = parsed.input;
                            break;
                        }
                    } catch (err) {}
                }
            }
        } catch (e) {}

        if (toolCall) {
            console.log("Executing Action:", toolCall);
            let cmd = `genos desktop action --type ${toolCall.action}`;
            if (toolCall.coordinate) {
                cmd += ` --x ${toolCall.coordinate[0]} --y ${toolCall.coordinate[1]}`;
            }
            if (toolCall.text) {
                cmd += ` --text "${toolCall.text.replace(/"/g, "\\\"")}"`;
            }
            
            try {
                runGenosSync(cmd);
                console.log("Action completed.");
                // Small sleep to let the UI update
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                console.error("Action failed:", e.message);
            }
        } else {
            console.log("No tool calls. Mission might be completed or model is confused.");
            console.log("Response:", text);
            break;
        }
    }
}

const args = process.argv.slice(2);
const mission = args[0] || "Ouvre le bloc note et écrit GenOS V3.";
runComputerUseLoop(mission).catch(console.error);

