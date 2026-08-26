import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ARENA = dirname(dirname(fileURLToPath(import.meta.url)));
export const MODEL = process.env.ARENA_MODEL ?? "qwen2.5-coder:14b";
const OLLAMA = process.env.ARENA_OLLAMA ?? "http://127.0.0.1:11434";

export function ws(agent) {
  const dir = join(ARENA, "workspaces", agent);
  if (!existsSync(dir)) throw new Error(`workspace missing: ${dir}`);
  return dir;
}

export function resultsDir(agent) {
  const dir = join(ARENA, "results", agent);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function scaffoldWorkspace(agent) {
  const dir = join(ARENA, "workspaces", agent);
  mkdirSync(join(dir, "src"), { recursive: true });
  copyIfMissing(join(ARENA, "scaffold", "Cargo.toml"), join(dir, "Cargo.toml"));
  copyIfMissing(join(ARENA, "scaffold", "lib.rs"), join(dir, "src", "lib.rs"));
  copyIfMissing(join(ARENA, "SCENARIO.md"), join(dir, "SCENARIO.md"));
  return dir;
}

function copyIfMissing(from, to) {
  if (!existsSync(to)) copyFileSync(from, to);
}

// ---------- outils agents ----------

function shellProc(cmd, cwd, timeoutMs) {
  return new Promise((resolvePromise) => {
    const proc = spawn(cmd, { cwd, shell: true, windowsHide: true });
    let out = "";
    let timedOut = false;
    const collect = (d) => (out += d);
    proc.stdout.on("data", collect);
    proc.stderr.on("data", collect);
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, output: `${out}${timedOut ? "\n[TIMEOUT]" : ""}` });
    });
  });
}

/** Commande outil agent (avec garde-fou temps). */
async function shTool(cmd, cwd, timeoutMs = 10 * 60_000) {
  const r = await shellProc(cmd, cwd, timeoutMs);
  return { code: r.code, output: r.output.slice(-8000) };
}

/** Commande harnais (verification deterministe). */
export async function sh(cmd, cwd) {
  const r = await shellProc(cmd, cwd, 10 * 60_000);
  return { code: r.code, output: r.output.slice(-12000) };
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with the given content (relative path in the workspace).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file (relative path in the workspace).",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files of the workspace recursively.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description: "Run a shell command in the workspace (compilation, tests, linter). Output truncated to the last 8000 chars.",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    },
  },
];

async function executeTool(name, args, cwd) {
  try {
    switch (name) {
      case "write_file": {
        const target = resolve(cwd, args.path);
        if (!target.startsWith(resolve(cwd))) return "[REFUSE] chemin hors workspace";
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, args.content ?? "");
        return `OK ${args.path} (${(args.content ?? "").length} octets)`;
      }
      case "read_file":
        return readFileSync(resolve(cwd, args.path), "utf8").slice(0, 20000) || "(vide)";
      case "list_files": {
        const files = [];
        const walk = (d, prefix = "") => {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            if (e.name === "target" || e.name.startsWith(".")) continue;
            if (e.isDirectory()) walk(join(d, e.name), `${prefix}${e.name}/`);
            else files.push(`${prefix}${e.name}`);
          }
        };
        walk(cwd);
        return files.join("\n") || "(vide)";
      }
      case "bash": {
        const r = await shTool(args.command, cwd);
        return `exit=${r.code}\n${r.output}`;
      }
      default:
        return `[OUTIL INCONNU] ${name}`;
    }
  } catch (error) {
    return `[ERREUR OUTIL] ${error.message}`;
  }
}

// ---------- boucle agent ----------

async function chatOnce(messages, signal) {
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, stream: true, options: { num_ctx: 32768 } }),
    signal,
  });
  if (!response.ok) throw new Error(`ollama http ${response.status}`);
  // lecture NDJSON manuelle pour gerer les timeouts longs proprement
  let full = { message: { content: "", tool_calls: [] }, prompt_eval_count: 0, eval_count: 0 };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.message?.content) full.message.content += chunk.message.content;
      if (chunk.message?.tool_calls) full.message.tool_calls.push(...chunk.message.tool_calls);
      if (chunk.prompt_eval_count) full.prompt_eval_count = chunk.prompt_eval_count;
      if (chunk.eval_count) full.eval_count = chunk.eval_count;
      if (chunk.done_reason) full.done_reason = chunk.done_reason;
    }
  }
  return full;
}

const SYSTEM = `You are an autonomous software engineer agent. Your workspace is the current directory and contains SCENARIO.md (the requirements, in French).
Work exclusively inside the workspace. Use the provided tools (write_file, read_file, list_files, bash) to explore, write Rust code and verify it.
Rules:
- Deliver production-quality Rust satisfying EVERY constraint of SCENARIO.md.
- NEVER leave placeholders or stub code: an incomplete implementation is a total failure.
- Write COMPLETE unit tests covering all public functions and edge cases, including a test named bench_10k that runs 10000 authenticated validations and asserts mean latency < 1ms. A crate with zero tests is a failure.
- Do not modify the [package] name nor remove the [workspace] section of Cargo.toml (you may add dependencies).
- Verify mechanically before finishing: cargo test must pass AND cargo clippy --all-targets -- -D warnings must be silent.
- When done, write your final agent report in French into REPORT.md (approach, choices, trade-offs, measured results).
- Reply with a SHORT French summary only when everything is verified.`;

export async function runClaude({ cwd, prompt, label = "", maxTurns = 30, timeoutMs = 20 * 60_000 }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: prompt },
  ];
  let inputTokens = 0;
  let outputTokens = 0;
  let turns = 0;
  let text = "";
  let writeSig = null;
  try {
    while (turns < maxTurns) {
      const res = await chatOnce(messages, controller.signal);
      inputTokens += res.prompt_eval_count ?? 0;
      outputTokens += res.eval_count ?? 0;
      text = res.message.content ?? "";
      let calls = res.message.tool_calls ?? [];
      let native = calls.length > 0;
      if (!calls.length) {
        const inline = parseInlineToolCalls(text);
        if (inline.length) {
          calls = inline;
          native = false;
        }
      }
      const assistantMsg = { role: "assistant", content: text };
      if (native) {
        assistantMsg.tool_calls = calls.map((c) => ({
          function: {
            name: c.function.name,
            arguments: typeof c.function.arguments === "string" ? safeParse(c.function.arguments) : c.function.arguments,
          },
        }));
      }
      messages.push(assistantMsg);
      if (!calls.length) break;
      turns++;
      let repeatedWrite = false;
      for (const call of calls) {
        const args = safeArgs(call.function.arguments);
        const result = await executeTool(call.function.name, args, cwd);
        if (call.function.name === "write_file") {
          const sig = `${args.path}:${(args.content ?? "").length}`;
          repeatedWrite = writeSig === sig;
          writeSig = sig;
        }
        ledgerHook(cwd, `[${label}] tour ${turns}: ${call.function.name}(${JSON.stringify(args).slice(0, 80)}) -> ${String(result).slice(0, 100)}`);
        messages.push({ role: "tool", tool_name: call.function.name, content: String(result) });
      }
      if (repeatedWrite) {
        messages.push({
          role: "user",
          content: "STOP: tu reecris exactement le meme fichier. Sors de cette boucle immediatement : produis maintenant l'IMPLEMENTATION COMPLETE en un seul appel write_file (code Rust reel, pas de placeholder), puis verifie avec cargo test.",
        });
      }
    }
  } catch (error) {
    text += `\n[AGENT ERROR] ${error.message}`;
  } finally {
    clearTimeout(timer);
  }
  return {
    text,
    meta: {
      label,
      exitCode: 0,
      durationMs: Date.now() - started,
      turns,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      costUsd: 0,
      timedOut: false,
    },
  };
}

let hookTarget = null;
function ledgerHook(_cwd, line) {
  if (hookTarget) appendFileSync(hookTarget, line + "\n");
}
export function setToolLog(path) {
  hookTarget = path;
}

function safeArgs(raw) {
  return safeParse(raw);
}

function safeParse(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Certains modeles emettent les appels d'outils en blocs JSON dans le contenu. */
function parseInlineToolCalls(text) {
  const calls = [];
  for (const candidate of extractJsonObjects(text)) {
    try {
      const obj = JSON.parse(candidate);
      if (obj?.name && obj?.arguments !== undefined) {
        calls.push({
          function: {
            name: obj.name,
            arguments: typeof obj.arguments === "string" ? obj.arguments : JSON.stringify(obj.arguments),
          },
        });
      }
    } catch {}
  }
  return calls;
}

function extractJsonObjects(text) {
  const objs = [];
  let i = 0;
  while ((i = text.indexOf("{", i)) !== -1) {
    let depth = 0, inStr = false, esc = false, closed = false;
    for (let j = i; j < text.length && !closed; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objs.push(text.slice(i, j + 1));
          i = j + 1;
          closed = true;
        }
      }
    }
    if (!closed) break;
  }
  return objs;
}

export class Ledger {
  constructor(agent) {
    this.agent = agent;
    this.calls = [];
    this.startedAt = Date.now();
    setToolLog(join(resultsDir(agent), "transcript.log"));
  }
  add(call) {
    this.calls.push(call);
    this.log(`${call.label}: ${call.durationMs}ms, in=${call.inputTokens}, out=${call.outputTokens}, tours=${call.turns}`);
  }
  log(line) {
    appendFileSync(join(resultsDir(this.agent), "transcript.log"), `[${new Date().toISOString()}] ${line}\n`);
  }
  dump(extra = {}) {
    const totals = this.calls.reduce(
      (acc, c) => ({
        llmCalls: acc.llmCalls + 1,
        inputTokens: acc.inputTokens + c.inputTokens,
        outputTokens: acc.outputTokens + c.outputTokens,
        costUsd: acc.costUsd + (c.costUsd ?? 0),
      }),
      { llmCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    );
    const metrics = {
      agent: this.agent,
      model: MODEL,
      wallClockMs: Date.now() - this.startedAt,
      ...totals,
      costUsd: Number(totals.costUsd.toFixed(4)),
      ...extra,
    };
    writeFileSync(join(resultsDir(this.agent), "metrics.json"), JSON.stringify(metrics, null, 2));
    return metrics;
  }
}
