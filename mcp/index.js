import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import path from "path";

const server = new Server({ name: "genos-v2-mcp", version: "2.0.0" }, { capabilities: { tools: {} } });

async function runGenos(args) {
    return new Promise((resolve, reject) => {
        const genosPath = path.resolve(process.cwd(), "../crates/genos-core");
        const cargoPath = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
        const child = spawn(cargoPath, ["run", "-q", "--bin", "genos", "--", ...args], {
            cwd: genosPath, shell: false
        });

        let out = "";
        child.stdout.on("data", d => out += d.toString());
        child.stderr.on("data", d => out += d.toString());

        child.on("close", code => {
            resolve(out);
        });
        
        child.on("error", err => {
            reject(err);
        });
    });
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        { name: "genos_v2_init", description: "Init" },
        { name: "genos_v2_fork", description: "Fork" }
    ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    let args = [];
    try {
        switch (request.params.name) {
            case "genos_v2_init": args = ["init"]; break;
            case "genos_v2_fork": args = ["fork", "--parent-id", request.params.arguments?.parent_id || "ROOT"]; break;
            default: args = ["init"];
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
