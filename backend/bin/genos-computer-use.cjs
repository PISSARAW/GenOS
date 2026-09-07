const { generate } = require("../src/services/modelProvider");
const { runGenosSync } = require("../src/services/genosCli");
const fs = require("fs");
const path = require("path");

// Anthropic exposes a native "computer" tool; other providers (Ollama,
// LM Studio, vLLM) get a generic vision+JSON-action prompt instead. Either
// way the model must support image input - plain text models (e.g. llama3.1)
// cannot see the screenshot and will never produce a usable action.
const KNOWN_VISION_HINTS = /vl|vision|llava|moondream|minicpm|pixtral|bakllava|gemma-?3|qwen.*vl/i;

function resolveComputerUseModel() {
    const candidate = process.env.GENOS_COMPUTER_USE_MODEL || process.env.GENOS_DEFAULT_MODEL || "anthropic://claude-3-5-sonnet-20241022";
    const match = candidate.match(/^([\w-]+):\/\/(.+)$/);
    const provider = match ? match[1] : '';
    const modelName = match ? match[2] : '';
    if (provider !== 'anthropic' && !KNOWN_VISION_HINTS.test(modelName)) {
        console.warn(`Warning: '${candidate}' does not look like a vision model. Computer Use needs image input; use a model such as ollama://qwen2.5vl:7b, ollama://llama3.2-vision, or ollama://minicpm-v, or set GENOS_COMPUTER_USE_MODEL=anthropic://<model>.`);
    }
    return { model: candidate, provider };
}

const LOCAL_VISION_INSTRUCTIONS = `You control a computer via screenshots. Respond with ONLY a single JSON object (no prose, no markdown fences, no extra objects) describing the next action(s). A new screenshot is taken after your actions run, so never request one. Allowed action types only: mouse_move, click, type, key. You may chain several steps that should run back-to-back before the next screenshot (e.g. open a launcher, type a command, press Enter) using "actions": [...]. Examples:
{"actions":[{"type":"key","text":"super"},{"type":"type","text":"notepad"},{"type":"key","text":"enter"}]}
{"actions":[{"type":"click","x":100,"y":200,"button":"left"}]}
A single action is also accepted without wrapping: {"type":"type","text":"hello"}. Coordinates are pixels from the top-left corner and must never be negative. When the mission is complete, respond with {"action":"done"}.`;

// Local vision models often ignore instructions and invent action names or
// emit several JSON objects in one reply; normalize/validate before executing.
const SUPPORTED_ACTIONS = new Set(["mouse_move", "click", "type", "key"]);
const ACTION_ALIASES = {
    left_click: "click", leftclick: "click", mouse_click: "click", click_note: "click",
    right_click: "click", rightclick: "click", double_click: "click", doubleclick: "click",
    move: "mouse_move", mousemove: "mouse_move", move_mouse: "mouse_move",
    type_text: "type", typing: "type", write: "type",
    keypress: "key", press_key: "key", key_press: "key",
};
const NOOP_ACTIONS = new Set(["screenshot", "wait", "none", "observe"]);

function extractFirstJson(text) {
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0; let inString = false; let escape = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escape) escape = false;
            else if (ch === "\\") escape = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    return null;
}

function normalizeToolCall(raw) {
    const rawName = raw && (raw.action || raw.type);
    if (!rawName) return null;
    const rawAction = String(rawName).toLowerCase();
    if (NOOP_ACTIONS.has(rawAction)) return { skip: true };
    let button = raw.button;
    if (/^right/.test(rawAction)) button = button || "right";
    if (/^middle/.test(rawAction)) button = button || "middle";
    const action = ACTION_ALIASES[rawAction] || rawAction;
    if (!SUPPORTED_ACTIONS.has(action)) return null;
    const result = { type: action, text: raw.text, button };
    const coordinate = Array.isArray(raw.coordinate) ? raw.coordinate : (raw.x !== undefined && raw.y !== undefined ? [raw.x, raw.y] : null);
    if (Array.isArray(coordinate) && coordinate.length === 2) {
        const [nx, ny] = coordinate.map((n) => Math.max(0, Math.round(Number(n)) || 0));
        result.x = nx; result.y = ny;
    }
    return result;
}

// Normalizes either {"actions":[...]} (a multi-step plan) or a bare single
// action object into an array of executable steps (dropping unsupported ones).
function normalizePlan(parsed) {
    const rawSteps = Array.isArray(parsed.actions) ? parsed.actions : [parsed];
    const steps = [];
    for (const rawStep of rawSteps) {
        const normalized = normalizeToolCall(rawStep);
        if (normalized && !normalized.skip) steps.push(normalized);
    }
    return steps;
}

// Local models sometimes emit raw control characters inside JSON strings
// (e.g. literal newlines), which JSON.parse rejects; escape and retry once.
function tryParseJson(str) {
    try { return JSON.parse(str); } catch (e) {}
    try { 
        let cleanStr = str.replace(/[\u0000-\u001F]+/g, (m) => (m.includes("\n") ? "\\n" : " "));
        cleanStr = cleanStr.replace(/'([^']+)'\s*:/g, '"$1":');
        cleanStr = cleanStr.replace(/:\s*'([^']+)'/g, ':"$1"');
        return JSON.parse(cleanStr); 
    } catch (e) { return null; }
}

async function runComputerUseLoop(mission) {
    console.log(`Starting Computer Use Mission: ${mission}`);
    const { model, provider } = resolveComputerUseModel();
    const isAnthropic = provider === 'anthropic';
    // Each iteration only sees the current screenshot, so without this the model
    // has no memory of what it already did and tends to repeat completed actions.
    const history = [];

    let iterations = 0;
    while (iterations < 15) {
        iterations++;
        console.log(`\n--- Iteration ${iterations} ---`);
        
        // 1. Capture screen to file to avoid ENOBUFS (maxBuffer exceeded) in spawnSync
        console.log("Capturing screen...");
        let base64Image;
        const screenPath = path.join(process.cwd(), ".genos", "current_screen.png").replace(/\\/g, "/");
        try {
            // Ensure .genos dir exists
            if (!fs.existsSync(path.dirname(screenPath))) fs.mkdirSync(path.dirname(screenPath), { recursive: true });
            
            runGenosSync(`genos desktop capture --out "${screenPath}"`, { maxBuffer: 1024 * 1024 * 50 });
            
            // `genos desktop capture --out` writes the base64 string itself (not raw PNG
            // bytes), so read it as text - re-encoding it as base64 would double-encode it.
            base64Image = fs.readFileSync(screenPath, "utf8").trim();
        } catch (e) {
            console.error("Failed to capture screen:", e.message);
            break;
        }

        // 2. Build prompt (Anthropic image block vs. generic OpenAI-style image_url)
        const historyText = history.length
            ? `\n\nActions already taken (do not repeat what already succeeded, check the screenshot first):\n${history.slice(-8).join("\n")}`
            : "";
        const prompt = isAnthropic
            ? [
                { type: "image", source: { type: "base64", media_type: "image/png", data: base64Image } },
                { type: "text", text: `Mission: ${mission}\n\nObserve the screen and use the computer tool to make progress. You may call the tool multiple times in this turn to chain steps (e.g. open a launcher, type a command, press Enter) - they all run before the next screenshot.${historyText}` }
            ]
            : [
                { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } },
                { type: "text", text: `Mission: ${mission}\n\n${LOCAL_VISION_INSTRUCTIONS}${historyText}` }
            ];

        // 3. Call model
        console.log("Thinking...");
        const result = await generate({
            model,
            prompt,
            stream: false,
            maxTokens: 4096
        });

        const text = result.text;
        console.log("Model responded.");

        // 4. Parse the next plan - possibly several steps to run back-to-back
        // before the next screenshot (fixes the model losing its train of
        // thought when forced to re-observe after every single action).
        let plan = [];
        let done = false;
        try {
            if (isAnthropic) {
                if (text.includes("\"type\":\"tool_use\"")) {
                    for (const line of text.split("\n")) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.type === "tool_use" && parsed.name === "computer") {
                                const normalized = normalizeToolCall(parsed.input);
                                if (normalized && !normalized.skip) plan.push(normalized);
                            }
                        } catch (err) {}
                    }
                }
            } else {
                const jsonStr = extractFirstJson(text);
                if (jsonStr) {
                    const parsed = tryParseJson(jsonStr);
                    if (parsed && parsed.action === "done") done = true;
                    else if (parsed) plan = normalizePlan(parsed);
                }
            }
        } catch (e) {}

        if (done) {
            console.log("Model signaled mission completion.");
            break;
        }

        if (!plan.length) {
            console.log("No tool calls. Mission might be completed or model is confused.");
            console.log("Response:", text);
            break;
        }

        // 5. Execute the whole plan in one Rust process call - actions run
        // back-to-back with no screenshot in between, so a step like
        // "open launcher -> type -> Enter" completes in one shot.
        console.log(`Executing plan (${plan.length} step${plan.length > 1 ? "s" : ""}):`, plan);
        const payload = JSON.stringify(plan).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        try {
            runGenosSync(`genos desktop actions --json "${payload}"`);
            console.log("Plan completed.");
            history.push(`${JSON.stringify(plan)} -> succeeded`);
        } catch (e) {
            console.error("Plan failed:", e.message);
            history.push(`${JSON.stringify(plan)} -> failed: ${e.message.split("\n")[0]}`);
        }
        await new Promise(r => setTimeout(r, 500));
    }
}

const args = process.argv.slice(2);
const mission = args[0] || "Ouvre le bloc note et écrit GenOS V3.";
runComputerUseLoop(mission).catch(console.error);

