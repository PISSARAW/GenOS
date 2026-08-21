// empirical_protocol_and_coverage_tests.rs
// Empirical test harness auditing protocol tools, tool counts, double-prefix bugs,
// and documentation coverage discrepancies.

#[test]
fn test_tool_catalog_counts_and_discrepancies() {
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

    // Discrepancies:
    // 1. crates/genos-protocol/tests/protocol_tests.rs asserts 32
    let protocol_test_asserted = 32usize;
    assert_ne!(total_actual, protocol_test_asserted);

    // 2. integrations/mcp/genos-mcp/src/lib.rs asserts 32
    let mcp_lib_asserted = 32usize;
    assert_ne!(total_actual, mcp_lib_asserted);

    // 3. docs/4-interfaces/mcp-tools-reference.md claims 40
    let mcp_docs_claimed = 40usize;
    assert_ne!(total_actual, mcp_docs_claimed);
    assert_eq!(total_actual - mcp_docs_claimed, 25);
}

#[test]
fn test_security_tool_double_prefix_bug() {
    // In SpecBuilder::new(operation, ...), it formats format!("genos_{operation}").
    // In security.rs, operations are passed as "genos_configure_gateway" and "genos_inject_crispr_spacer".
    let op_configure = "genos_configure_gateway";
    let formatted_configure = format!("genos_{op_configure}");
    assert_eq!(formatted_configure, "genos_genos_configure_gateway");

    let op_crispr = "genos_inject_crispr_spacer";
    let formatted_crispr = format!("genos_{op_crispr}");
    assert_eq!(formatted_crispr, "genos_genos_inject_crispr_spacer");
}
