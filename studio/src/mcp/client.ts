import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { useGenOSStore } from '../store/useGenOSStore';

let mcpClient: Client | null = null;

export async function connectMCP(mcpUrl: string = 'http://127.0.0.1:8799/mcp') {
  if (mcpClient) return mcpClient;

  const store = useGenOSStore.getState();
  store.setConnectionStatus('connecting');

  try {
    const token = localStorage.getItem('genos_mcp_token') || '';
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    });
    
    mcpClient = new Client(
      {
        name: 'GenOS Studio Client',
        version: '1.0.0',
      },
      {
        capabilities: {
          experimental: {
            genosObservability: {}
          }
        },
      }
    );

    // Listen to notifications to populate our observability store
    setupNotifications(mcpClient);

    await mcpClient.connect(transport);
    
    store.setConnectionStatus('connected');
    console.log('Connected to GenOS MCP Server');
    
    return mcpClient;
  } catch (error) {
    console.error('Failed to connect to MCP:', error);
    store.setConnectionStatus('disconnected');
    mcpClient = null;
    throw error;
  }
}

function setupNotifications(client: Client) {
  const store = useGenOSStore.getState();
  
  client.fallbackNotificationHandler = async (notification) => {
    const method = notification.method;
    const params = notification.params as any;

    if (method === 'genos/mcts_update' || method === 'notifications/genos/mcts_update') {
      if (params && params.agentId && params.tree) {
        store.updateMCTSTree(params.agentId, params.tree);
      }
    } else if (method === 'genos/clone_status' || method === 'notifications/genos/clone_status') {
      if (params && params.clone) {
        store.addOrUpdateClone(params.clone);
      }
    } else if (method === 'genos/hallucination_alert' || method === 'notifications/genos/hallucination_alert') {
      if (params && params.alert) {
        store.addHallucination(params.alert);
      }
    } else if (method === 'genos/trace_span' || method === 'notifications/genos/trace_span') {
      if (params && params.agentId && params.span) {
        store.addTraceSpan(params.agentId, params.span);
      }
    } else if (method === 'genos/evaluation_score' || method === 'notifications/genos/evaluation_score') {
      if (params && params.evaluation) {
        store.addEvaluation(params.evaluation);
      }
    }
  };
}

export function getMCPClient() {
  return mcpClient;
}

export async function disconnectMCP() {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
    const store = useGenOSStore.getState();
    store.setConnectionStatus('disconnected');
  }
}
