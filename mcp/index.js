import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import path from "path";

const server = new Server({ name: "genos-v2-mcp", version: "2.0.0" }, { capabilities: { tools: {} } });

async function runGenos(args) {
    return new Promise((resolve, reject) => {
        // Run cargo relative to the project root
        const genosPath = path.resolve(process.cwd(), "../crates/genos-core");
        const child = spawn("cargo", ["run", "-q", "--bin", "genos", "--", ...args], {
            cwd: genosPath, shell: true
        });

        let out = "";
        child.stdout.on("data", d => out += d.toString());
        child.stderr.on("data", d => out += d.toString());

        child.on("close", code => {
            resolve(out);
        });
    });
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        { name: "genos_v2_init", description: "Initialize a new Zygote agent swarm", inputSchema: { type: "object", properties: {} } },
        { name: "genos_v2_fork", description: "Trigger mitosis to clone an agent", inputSchema: { type: "object", properties: { parent_id: { type: "string" } } } },
        { name: "genos_v2_gc", description: "Trigger Proteasome and Autophagy to clean toxic tokens", inputSchema: { type: "object", properties: { agent_id: { type: "string" } }, required: ["agent_id"] } },
        { name: "genos_v2_blame", description: "Trace epigenetic methylation to find hallucination origin", inputSchema: { type: "object", properties: { agent_id: { type: "string" } }, required: ["agent_id"] } },
        { name: "genos_v2_replay", description: "Hippocampal replay of ActionTrace", inputSchema: { type: "object", properties: { agent_id: { type: "string" } }, required: ["agent_id"] } },
        { name: "genos_v2_bisect", description: "Binary search in action trace for a specific toxic token", inputSchema: { type: "object", properties: { agent_id: { type: "string" }, error_token: { type: "string" } }, required: ["agent_id", "error_token"] } }
    ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    let args = [];
    try {
        switch (request.params.name) {
            case "genos_v2_init": args = ["init"]; break;
            case "genos_v2_fork": args = ["fork"]; if (request.params.arguments?.parent_id) args.push("--parent-id", request.params.arguments.parent_id); break;
            case "genos_v2_gc": args = ["gc", "--agent-id", request.params.arguments.agent_id]; break;
            case "genos_v2_blame": args = ["blame", "--agent-id", request.params.arguments.agent_id]; break;
            case "genos_v2_replay": args = ["replay", "--agent-id", request.params.arguments.agent_id]; break;
            case "genos_v2_bisect": args = ["bisect", "--agent-id", request.params.arguments.agent_id, "--error-token", request.params.arguments.error_token]; break;
            default: throw new Error("Unknown tool");
        }
        const result = await runGenos(args);
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("🧬 GenOS V2 MCP Server running on stdio");
