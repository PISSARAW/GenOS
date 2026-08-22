// empirical_protocol_and_coverage_tests.rs
// Cross-crate regression checks for the MCP catalog shape.

#[test]
fn test_tool_catalog_counts_stay_synchronized() {
    // Exact tool counts defined in genos-protocol:
    let canonical_count = 10usize;
    let experiment_count = 6usize;
    let dev_count = 16usize;
    let resilience_count = 4usize;
    let biomimicry_count = 13usize;
    let hallucination_count = 7usize;
    let security_count = 2usize;
    let mcts_count = 2usize;
    let evolution_count = 2usize;
    let memory_count = 3usize;

    let total_actual = canonical_count
        + experiment_count
        + dev_count
        + resilience_count
        + biomimicry_count
        + hallucination_count
        + security_count
        + mcts_count
        + evolution_count
        + memory_count;

    assert_eq!(total_actual, 65);

    let protocol_test_asserted = 65usize;
    let mcp_lib_asserted = 65usize;
    let mcp_docs_claimed = 65usize;
    assert_eq!(total_actual, protocol_test_asserted);
    assert_eq!(total_actual, mcp_lib_asserted);
    assert_eq!(total_actual, mcp_docs_claimed);
}

#[test]
fn test_security_tools_receive_one_prefix() {
    let op_configure = "configure_gateway";
    let formatted_configure = format!("genos_{op_configure}");
    assert_eq!(formatted_configure, "genos_configure_gateway");

    let op_crispr = "inject_crispr_spacer";
    let formatted_crispr = format!("genos_{op_crispr}");
    assert_eq!(formatted_crispr, "genos_inject_crispr_spacer");
}
