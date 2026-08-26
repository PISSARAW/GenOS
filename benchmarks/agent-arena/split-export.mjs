import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARENA = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(ARENA, f), "utf8");
const write = (f, c) => fs.writeFileSync(path.join(ARENA, f), c);

const wrap = (title, pairs) =>
  `# ${title}\n\n` +
  pairs
    .map(([f, c]) => `## ${f}\n\n\`\`\`js\n${c}\n\`\`\`\n`)
    .join("\n");

write(
  "EXPORT_1_HARNESS_RUNTIME.md",
  wrap("Harnais — runtime d'agent commun", [["harnesses/lib.mjs", read("harnesses/lib.mjs")]]),
);

write(
  "EXPORT_2_EVALUATEUR.md",
  wrap("Évaluateur objectif de l'arène", [["evaluator.mjs", read("evaluator.mjs")]]),
);

write(
  "EXPORT_2_RIVAUX_CONVERSATIONNELS.md",
  wrap("Harnais rivaux — AutoGen, CrewAI, LangGraph", [
    ["harnesses/autogen.mjs", read("harnesses/autogen.mjs")],
    ["harnesses/crewai.mjs", read("harnesses/crewai.mjs")],
    ["harnesses/langgraph.mjs", read("harnesses/langgraph.mjs")],
  ]),
);

write(
  "EXPORT_3_RIVAUX_STRUCTURES.md",
  wrap("Harnais rivaux — MetaGPT, GenOS, Mastra", [
    ["harnesses/metagpt.mjs", read("harnesses/metagpt.mjs")],
    ["harnesses/genos.mjs", read("harnesses/genos.mjs")],
    ["harnesses/mastra.mjs", read("harnesses/mastra.mjs")],
  ]),
);

const metrics = ["autogen", "crewai", "langgraph", "metagpt", "genos", "mastra"]
  .map((a) => `### results/${a}/metrics.json\n\n\`\`\`json\n${read(`results/${a}/metrics.json`)}\n\`\`\``)
  .join("\n\n");

let traces = "";
try {
  traces =
    "\n### workspaces/mastra/.mastra/traces.jsonl\n\n\`\`\`json\n[" +
    read("workspaces/mastra/.mastra/traces.jsonl").trim().split("\n").join(",\n") +
    "\n]\n\`\`\`";
} catch {}

write(
  "EXPORT_4_METRICS_JSON.md",
  `# Metrics JSON par agent\n\n${metrics}\n`,
);

write(
  "EXPORT_5_EVALUATION_ET_TRACES.md",
  `# Évaluation objective et traces du workflow Mastra\n\n### results/evaluation.json\n\n\`\`\`json\n${read("results/evaluation.json")}\n\`\`\`${traces}\n`,
);

for (const f of fs.readdirSync(ARENA).filter((f) => f.startsWith("EXPORT"))) {
  const n = read(f).split("\n").length;
  console.log(`${f}: ${n} lignes`);
}
for (const f of ["ARENA_EXPORT.md", "EXPORT_1_HARNESS_CORE.md", "EXPORT_4_TRACES_JSON.md"]) {
  const p = path.join(ARENA, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
