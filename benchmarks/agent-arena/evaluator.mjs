#!/usr/bin/env node
// Evaluateur objectif de l'arene : mesures identiques pour tous les workspaces.
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sh } from "./harnesses/lib.mjs";

const ARENA = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const AGENTS = ["autogen", "crewai", "langgraph", "metagpt", "genos"];

function rsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    const p = join(dir, entry);
    try {
      if (statSync(p).isFile() && entry.endsWith(".rs") && !entry.includes("target")) out.push(p);
    } catch {}
  }
  return out;
}

function analyzeCode(files) {
  let loc = 0, functions = 0, decisions = 0, maxCcn = 0, fnCount = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    loc += src.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("//")).length;
    for (const m of src.matchAll(/fn\s+\w+[^{]*\{/g)) {
      functions++;
      const start = m.index + m[0].length;
      let depth = 1, i = start;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      }
      const body = src.slice(start, i);
      const d = (body.match(/\bif\b|\bfor\b|\bwhile\b|\bmatch\b|&&|\|\||=>/g) ?? []).length;
      const ccn = 1 + d;
      decisions += d;
      fnCount++;
      if (ccn > maxCcn) maxCcn = ccn;
    }
  }
  return {
    loc,
    functions,
    avgCcn: fnCount ? Number((1 + decisions / fnCount).toFixed(2)) : 0,
    maxCcn,
  };
}

function securityScan(files) {
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  return {
    constantTimePrimitive: /subtle|constant_time|ct_eq|xor.*fold|\^=.*diff|diff\s*\|=/i.test(all),
    cryptographicHash: /sha2|Sha256|blake|argon2|bcrypt/i.test(all),
    strictInputValidation: /len\(\)|is_ascii|charset|min_len|max_len/i.test(all),
    naiveSecretCompare: /==\s*(expected|actual|token|secret)\b|expected\.as_str\(\)\s*==/.test(all),
  };
}

async function evaluate(agent) {
  const dir = join(ARENA, "workspaces", agent);
  if (!existsSync(dir)) return { agent, error: "workspace absent" };
  const files = rsFiles(dir);
  const code = analyzeCode(files);
  const security = securityScan(files);

  const test = await sh("cargo test", dir);
  const testPassed = parseInt(/(\d+) passed/.exec(test.output)?.[1] ?? "0", 10);
  const testFailed = parseInt(/(\d+) failed/.exec(test.output)?.[1] ?? "0", 10);
  const compileError = /error\[E\d+\]|could not compile/.test(test.output);

  const clippy = await sh("cargo clippy --all-targets -- -D warnings", dir);
  const clippyWarnings = (clippy.output.match(/^warning:/gm) ?? []).length;

  const benchPresent = /bench_10k/.test(files.map((f) => readFileSync(f, "utf8")).join("\n"));
  let benchMs = null;
  const benchRunStart = Date.now();
  if (benchPresent) {
    const bench = await sh("cargo test --release bench_10k -- --ignored --nocapture", dir);
    benchMs = parseFloat(/moyenne[^\d]*(\d+\.?\d*)\s*(us|µs|ms)/i.exec(bench.output)?.[1] ?? "nan");
    if (Number.isNaN(benchMs)) benchMs = null;
  }
  const externalBenchWallMs = benchPresent ? Date.now() - benchRunStart : null;

  const reportPath = join(dir, "REPORT.md");
  const report = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : null;

  let aiMetrics = {};
  const metricsPath = join(ARENA, "results", agent, "metrics.json");
  if (existsSync(metricsPath)) aiMetrics = JSON.parse(readFileSync(metricsPath, "utf8"));

  return {
    agent,
    functional: { compileError, testPassed, testFailed, cargoTestGreen: test.code === 0 && testPassed > 0 },
    quality: { clippyGreen: clippy.code === 0, clippyWarnings },
    security,
    performance: { bench10kPresent: benchPresent, reportedMeanMs: benchMs },
    complexity: code,
    deliverables: { reportPresent: !!report, reportBytes: report?.length ?? 0 },
    aiMetrics,
  };
}

const results = [];
for (const agent of AGENTS) {
  console.log(`evaluation de ${agent}...`);
  results.push(await evaluate(agent));
}
writeFileSync(join(ARENA, "results", "evaluation.json"), JSON.stringify(results, null, 2));
console.table(
  results.map((r) => ({
    agent: r.agent,
    testsOK: r.functional?.cargoTestGreen,
    passed: r.functional?.testPassed,
    clippyOK: r.quality?.clippyGreen,
    timingSafe: r.security?.constantTimePrimitive,
    LOC: r.complexity?.loc,
    avgCCN: r.complexity?.avgCcn,
    llmCalls: r.aiMetrics?.llmCalls,
    tokensIn: r.aiMetrics?.inputTokens,
    tokensOut: r.aiMetrics?.outputTokens,
    costUSD: r.aiMetrics?.costUsd,
    wallMin: Math.round((r.aiMetrics?.wallClockMs ?? 0) / 60000),
  })),
);
