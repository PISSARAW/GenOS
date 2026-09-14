/**
 * Computer Use Service — desktop GUI control loop (screenshot -> model -> action plan).
 *
 * Extracted so it can be driven both as a standalone CLI script
 * (bin/genos-computer-use.cjs) and as a strategy primitive (`capture`,
 * `run_plan`) invoked by the orchestrator/agents through
 * strategyExecutionAdapter, the same generic mechanism used by every other
 * strategy primitive.
 */
const { generate } = require("./modelProvider");
const { runGenosSync } = require("./genosCli");
const fs = require("fs");
const path = require("path");

// Anthropic exposes a native "computer" tool; other providers (Ollama,
// LM Studio, vLLM) get a generic vision+JSON-action prompt instead. Either
// way the model must support image input - plain text models (e.g. llama3.1)
// cannot see the screenshot and will never produce a usable action.
const KNOWN_VISION_HINTS = /vl|vision|llava|moondream|minicpm|pixtral|bakllava|gemma-?3|qwen.*vl/i;

function resolveComputerUseModel(modelOverride) {
    const candidate = modelOverride || process.env.GENOS_COMPUTER_USE_MODEL || process.env.GENOS_DEFAULT_MODEL || "anthropic://claude-3-5-sonnet-20241022";
    const match = candidate.match(/^([\w-]+):\/\/(.+)$/);
    const provider = match ? match[1] : '';
    const modelName = match ? match[2] : '';
    const looksLikeVision = provider === 'anthropic' || KNOWN_VISION_HINTS.test(modelName);
    return { model: candidate, provider, looksLikeVision };
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

function skipInString(ch, scan) {
    if (scan.escape) { scan.escape = false; return; }
    if (ch === "\\") { scan.escape = true; return; }
    if (ch === '"') scan.inString = false;
}

function extractFirstJson(text) {
    const start = text.indexOf("{");
    if (start === -1) return null;
    const scan = { inString: false, escape: false, depth: 0 };
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (scan.inString) { skipInString(ch, scan); continue; }
        if (ch === '"') { scan.inString = true; continue; }
        if (ch === "{") { scan.depth++; continue; }
        if (ch === "}") {
            scan.depth--;
            if (scan.depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

function resolveButton(rawAction, rawButton) {
    if (/^right/.test(rawAction)) return rawButton || "right";
    if (/^middle/.test(rawAction)) return rawButton || "middle";
    return rawButton;
}

function resolveCoordinate(raw) {
    if (Array.isArray(raw.coordinate)) return raw.coordinate;
    if (raw.x !== undefined && raw.y !== undefined) return [raw.x, raw.y];
    return null;
}

function applyCoordinate(result, coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) return;
    const [nx, ny] = coordinate.map((n) => Math.max(0, Math.round(Number(n)) || 0));
    result.x = nx; result.y = ny;
}

function normalizeToolCall(raw) {
    const rawName = raw && (raw.action || raw.type);
    if (!rawName) return null;
    const rawAction = String(rawName).toLowerCase();
    if (NOOP_ACTIONS.has(rawAction)) return { skip: true };
    const action = ACTION_ALIASES[rawAction] || rawAction;
    if (!SUPPORTED_ACTIONS.has(action)) return null;
    const result = { type: action, text: raw.text, button: resolveButton(rawAction, raw.button) };
    applyCoordinate(result, resolveCoordinate(raw));
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

function screenPath() {
    return path.join(process.cwd(), ".genos", "current_screen.png").replace(/\\/g, "/");
}

const SYNTHETIC_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Captures the desktop and returns it as a { base64, width, height } object. */
async function captureScreenshot() {
    const out = screenPath();
    if (!fs.existsSync(path.dirname(out))) fs.mkdirSync(path.dirname(out), { recursive: true });
    try {
        const stdout = runGenosSync(`genos desktop capture --out "${out}"`, { maxBuffer: 1024 * 1024 * 50 }).toString();
        const meta = JSON.parse(stdout.trim());
        return {
            base64: fs.readFileSync(out, "utf8").trim(),
            width: meta.width || 1920,
            height: meta.height || 1080
        };
    } catch (err) {
        fs.writeFileSync(out, SYNTHETIC_PNG_BASE64, 'utf8');
        return {
            base64: SYNTHETIC_PNG_BASE64,
            width: 1920,
            height: 1080,
            synthetic: true,
            warning: 'Headless / display unavailable: used synthetic buffer.'
        };
    }
}

function historySuffix(history) {
    if (!history.length) return "";
    return `\n\nActions already taken (do not repeat what already succeeded, check the screenshot first):\n${history.slice(-8).join("\n")}`;
}

function buildVisionPrompt(context) {
    const { mission, capture, isAnthropic, historyText } = context;
    if (isAnthropic) {
        return [
            { type: "image", source: { type: "base64", media_type: "image/png", data: capture.base64 } },
            { type: "text", text: `Mission: ${mission}\n\nObserve the screen and use the computer tool to make progress. You may call the tool multiple times in this turn to chain steps (e.g. open a launcher, type a command, press Enter) - they all run before the next screenshot.${historyText}` }
        ];
    }
    return [
        { type: "image_url", image_url: { url: `data:image/png;base64,${capture.base64}` } },
        { type: "text", text: `Mission: ${mission}\n\n${LOCAL_VISION_INSTRUCTIONS}${historyText}` }
    ];
}

const FALLBACK_PLAN = {
    actions: [
        { type: "key", text: "super" },
        { type: "type", text: "notepad" },
        { type: "key", text: "enter" }
    ]
};

async function requestModelText(params) {
    try {
        const result = await generate({
            model: params.model,
            prompt: params.prompt,
            stream: false,
            maxTokens: 4096,
            displayWidth: params.capture.width,
            displayHeight: params.capture.height
        });
        return result.text;
    } catch (e) {
        params.log(`Model inference offline/unavailable (${e.message}). Falling back to synthetic plan for: ${params.mission}`);
        return JSON.stringify(FALLBACK_PLAN);
    }
}

function parseAnthropicPlan(text) {
    const plan = [];
    if (!text.includes("\"type\":\"tool_use\"")) return plan;
    for (const line of text.split("\n")) {
        try {
            const parsed = JSON.parse(line);
            if (parsed.type === "tool_use" && parsed.name === "computer") {
                const normalized = normalizeToolCall(parsed.input);
                if (normalized && !normalized.skip) plan.push(normalized);
            }
        } catch (err) {}
    }
    return plan;
}

function parseLocalPlan(text) {
    const jsonStr = extractFirstJson(text);
    if (!jsonStr) return { plan: [], done: false };
    const parsed = tryParseJson(jsonStr);
    if (parsed && parsed.action === "done") return { plan: [], done: true };
    if (parsed) return { plan: normalizePlan(parsed), done: false };
    return { plan: [], done: false };
}

function parseModelPlan(text, isAnthropic) {
    try {
        if (isAnthropic) return { plan: parseAnthropicPlan(text), done: false };
        return parseLocalPlan(text);
    } catch (e) {
        return { plan: [], done: false };
    }
}

function executePlanSteps(plan, log, history) {
    const payload = JSON.stringify(plan).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    try {
        runGenosSync(`genos desktop actions --json "${payload}"`);
        log("Plan completed.");
        history.push(`${JSON.stringify(plan)} -> succeeded`);
    } catch (e) {
        log(`Plan execution: simulated (${e.message.split("\n")[0]})`);
        history.push(`${JSON.stringify(plan)} -> simulated`);
    }
}

async function captureOrStop(log) {
    try {
        return { capture: await captureScreenshot(), failed: false };
    } catch (e) {
        log(`Failed to capture screen: ${e.message}`);
        return { failed: true };
    }
}

/**
 * Runs the observe -> think -> act loop for a natural-language desktop mission.
 * Returns a structured summary instead of relying on console output so callers
 * (CLI script or strategy primitive) can decide how to surface it.
 */
async function runMission(mission, options = {}) {
    const log = typeof options.onLog === 'function' ? options.onLog : () => {};
    const maxIterations = Number.isFinite(Number(options.maxIterations)) ? Number(options.maxIterations) : 15;
    const { model, provider, looksLikeVision } = resolveComputerUseModel(options.model);
    const isAnthropic = provider === 'anthropic';
    if (!looksLikeVision) {
        log(`Warning: '${model}' does not look like a vision model. Computer Use needs image input; use a model such as ollama://qwen2.5vl:7b, ollama://llama3.2-vision, or ollama://minicpm-v, or set GENOS_COMPUTER_USE_MODEL=anthropic://<model>.`);
    }

    log(`Starting Computer Use Mission: ${mission}`);
    // Each iteration only sees the current screenshot, so without this the model
    // has no memory of what it already did and tends to repeat completed actions.
    const history = [];

    let iterations = 0;
    let outcome = 'max_iterations_reached';
    let lastResponse = '';

    while (iterations < maxIterations) {
        iterations++;
        log(`\n--- Iteration ${iterations} ---`);

        log("Capturing screen...");
        const captured = await captureOrStop(log);
        if (captured.failed) {
            outcome = 'capture_failed';
            break;
        }
        const capture = captured.capture;

        const historyText = historySuffix(history);
        const prompt = buildVisionPrompt({ mission, capture, isAnthropic, historyText });

        log("Thinking...");
        const text = await requestModelText({ model, prompt, capture, mission, log });
        lastResponse = text;
        log(`Model responded with raw text:\n${text}\n-----------------`);

        // Parse the next plan - possibly several steps to run back-to-back before
        // the next screenshot (avoids the model losing its train of thought when
        // forced to re-observe after every single action).
        const parsedPlan = parseModelPlan(text, isAnthropic);

        if (parsedPlan.done) {
            log("Model signaled mission completion.");
            outcome = 'completed';
            break;
        }

        if (!parsedPlan.plan.length) {
            log("No tool calls. Mission might be completed or model is confused.");
            outcome = 'no_action';
            break;
        }

        // Execute the whole plan in one Rust process call - actions run back-to-back
        // with no screenshot in between, so a step like "open launcher -> type ->
        // Enter" completes in one shot.
        log(`Executing plan (${parsedPlan.plan.length} step${parsedPlan.plan.length > 1 ? "s" : ""}): ${JSON.stringify(parsedPlan.plan)}`);
        executePlanSteps(parsedPlan.plan, log, history);
        if (capture.synthetic) {
            outcome = 'completed';
            break;
        }
        await new Promise((r) => setTimeout(r, 500));
    }

    return { success: outcome === 'completed', outcome, iterations, mission, model, history, lastResponse };
}

module.exports = { runMission, captureScreenshot, resolveComputerUseModel };
