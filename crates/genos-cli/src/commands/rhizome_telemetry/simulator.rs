use super::graph::{GraphEdge, GraphNode, RhizomeGraph};
use std::sync::Arc;
use tokio::time::{sleep, Duration};

/// Bridge routes grown/pruned together during budding and contraction: (from, to).
const BRIDGE_ROUTES: [(u32, u32); 3] = [(2, 4), (4, 3), (3, 1)];

fn coordinator_node() -> GraphNode {
    GraphNode {
        id: 1,
        role: "rootless_coordinator".to_string(),
        label: "Rootless Coordinator".to_string(),
        state: "STABLE".to_string(),
        x: 0.32,
        y: 0.52,
    }
}

fn scout_node() -> GraphNode {
    GraphNode {
        id: 2,
        role: "boundary_scout".to_string(),
        label: "Boundary Scout".to_string(),
        state: "SCANNING".to_string(),
        x: 0.68,
        y: 0.52,
    }
}

fn offshoot_node() -> GraphNode {
    GraphNode {
        id: 3,
        role: "capability_offshoot".to_string(),
        label: "Capability Offshoot".to_string(),
        state: "SPAWNING".to_string(),
        x: 0.70,
        y: 0.22,
    }
}

fn bridge_node() -> GraphNode {
    GraphNode {
        id: 4,
        role: "local_bridge".to_string(),
        label: "Local Bridge".to_string(),
        state: "SPAWNING".to_string(),
        x: 0.48,
        y: 0.28,
    }
}

async fn grow_bridge_routes(graph: &Arc<RhizomeGraph>) {
    for (from, to) in BRIDGE_ROUTES {
        let id = graph.next_edge_id();
        graph
            .add_edge(GraphEdge { id, from, to, kind: "bridge".to_string() })
            .await;
    }
}

async fn prune_bridge_routes(graph: &Arc<RhizomeGraph>) {
    for (from, to) in BRIDGE_ROUTES {
        graph.remove_edge_between(from, to).await;
    }
}

async fn phase_baseline_topology(graph: &Arc<RhizomeGraph>) {
    graph.set_phase("1. BASELINE TOPOLOGY", 0).await;
    graph.add_node(coordinator_node()).await;
    graph.add_node(scout_node()).await;
    let baseline_edge = graph.next_edge_id();
    graph
        .add_edge(GraphEdge { id: baseline_edge, from: 1, to: 2, kind: "coordination".to_string() })
        .await;
    graph.log("Rhizome decentralized collective active (2 baseline nodes)").await;
    sleep(Duration::from_millis(700)).await;
}

async fn phase_boundary_gap_detected(graph: &Arc<RhizomeGraph>) {
    graph.set_phase("2. BOUNDARY GAP DETECTED", 1).await;
    graph.update_node_state(2, "API_GAP_HIT").await;
    graph.log("BOUNDARY HIT: missing OAuth2 token rotation & rate-limited bulk ingestion API").await;
    graph.log("Collective growth triggered: zero central orchestrator bottleneck").await;
    sleep(Duration::from_millis(700)).await;
}

async fn phase_dynamic_budding(graph: &Arc<RhizomeGraph>) {
    graph.set_phase("3. DYNAMIC BUDDING (SPAWNING)", 2).await;
    graph.add_node(offshoot_node()).await;
    graph.add_node(bridge_node()).await;
    grow_bridge_routes(graph).await;
    graph.log("BUDDING: sprouted Capability Offshoot #101 at boundary").await;
    graph.log("BUDDING: sprouted Local Bridge #42 to preserve decentralized mesh").await;
    sleep(Duration::from_millis(800)).await;
}

async fn phase_proof_verification(graph: &Arc<RhizomeGraph>) {
    graph.set_phase("4. PROOF EXECUTION & VERIFICATION", 3).await;
    graph.update_node_state(3, "VERIFIED").await;
    graph.update_node_state(4, "VERIFIED").await;
    graph.record_evidence(0.99).await;
    graph.log("Capability Offshoot generated compliant OAuth2 token rotator").await;
    graph.log("Local Bridge routed 18/18 mock API edge test cases: 100% passed").await;
    graph.log("Cryptographic receipt sealed: evidence barrier 0.99 validated").await;
    sleep(Duration::from_millis(800)).await;
}

async fn phase_harmonic_contraction(graph: &Arc<RhizomeGraph>) {
    graph.set_phase("5. HARMONIC CONTRACTION & PRUNING", 4).await;
    graph.log("Proof absorbed into collective substrate memory").await;
    sleep(Duration::from_millis(500)).await;
    prune_bridge_routes(graph).await;
    graph.remove_node(3).await;
    graph.remove_node(4).await;
    graph.update_node_state(2, "SCANNING").await;
    graph.log("Ephemeral Offshoot & Bridge successfully contracted and pruned").await;
    graph.set_phase("6. STABLE TOPOLOGY RESTORED", 5).await;
}

/// Runs one full budding/contraction cycle of the Rhizome graph, mutating shared state that is
/// streamed to telemetry consumers via `GraphMutated` events. Each phase mirrors a stage
/// previously only visible in the terminal simulation.
pub async fn run_one_pass(graph: &Arc<RhizomeGraph>) {
    phase_baseline_topology(graph).await;
    phase_boundary_gap_detected(graph).await;
    phase_dynamic_budding(graph).await;
    phase_proof_verification(graph).await;
    phase_harmonic_contraction(graph).await;
}

/// Continuously replays the budding/contraction cycle so the telemetry server always has a live
/// graph to serve, forever, until the process is stopped.
pub async fn run_forever(graph: Arc<RhizomeGraph>) {
    loop {
        run_one_pass(&graph).await;
        sleep(Duration::from_millis(1_500)).await;
        graph.reset().await;
    }
}
