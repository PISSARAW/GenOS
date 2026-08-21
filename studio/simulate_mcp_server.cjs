const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 3001, path: '/mcp' });

console.log('Simulation MCP Server started on ws://localhost:3001/mcp');

wss.on('connection', (ws) => {
  console.log('Studio connected! Waiting for MCP initialize...');
  let interval;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log('Received:', msg.method);

      if (msg.method === 'initialize') {
        // MCP Handshake response
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              experimental: { genosObservability: {} }
            },
            serverInfo: { name: 'GenOS Simulator', version: '1.0.0' }
          }
        }));
      }

      if (msg.method === 'notifications/initialized') {
        console.log('MCP Handshake complete! Starting data stream...');
        startStreaming(ws);
      }
    } catch (e) {
      console.error(e);
    }
  });

  function startStreaming(ws) {
    let step = 0;
    interval = setInterval(() => {
      step++;

      const sendNotification = (method, params) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: `notifications/${method}`, params })); // Fallback
      };

      // 1. MCTS Tree Update
      sendNotification('genos/mcts_update', {
        agentId: 'Antigravity-Core',
        tree: {
          id: 'root',
          state: 'Antigravity: Analysis',
          score: 0.95,
          visits: 42 + step,
          children: [
            {
              id: 'node1',
              state: 'Search codebase',
              score: 0.8 + (Math.random() * 0.2),
              visits: 12 + step,
              children: [
                { id: 'node3', state: 'grep_search(*)', score: 0.4, visits: 2 }
              ]
            },
            {
              id: 'node2',
              state: 'Read Architecture',
              score: 0.99,
              visits: 30 + step
            }
          ]
        }
      });

      // 2. Trace Span
      sendNotification('genos/trace_span', {
        agentId: 'Antigravity-Core',
        span: {
          id: `span_${step}`,
          name: `LLM Call #${step}`,
          latency: Math.floor(Math.random() * 800) + 200,
          tokens: Math.floor(Math.random() * 1500) + 100,
          timestamp: Date.now()
        }
      });

      // 3. Evaluation Score
      sendNotification('genos/evaluation_score', {
        evaluation: {
          agentId: 'Antigravity-Core',
          score: Math.min(1.0, 0.5 + (step * 0.05) + (Math.random() * 0.1)),
          generation: step,
          ampkLevel: Math.max(0, 1.0 - (step * 0.02))
        }
      });

    }, 2000);
  }

  ws.on('close', () => {
    console.log('Studio disconnected');
    if (interval) clearInterval(interval);
  });
});
