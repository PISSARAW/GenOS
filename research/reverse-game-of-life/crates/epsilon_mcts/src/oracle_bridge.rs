pub struct OracleBridge {}

impl OracleBridge {
    pub fn new() -> Self {
        OracleBridge {}
    }

    pub fn should_prune(&self, grid: &[u32; 20]) -> bool {
        // `oracle.py::evaluate_branch` returns 0.1 outside this population
        // window and at least 0.5 inside it. Since pruning uses a 0.2 cutoff,
        // the Python/Torch model cannot change this decision. Expressing the
        // equivalent predicate directly removes an unsafe embedded-Python
        // dependency and makes the solver portable and deterministic.
        let population: u32 = grid.iter().map(|row| row.count_ones()).sum();
        !(15..=80).contains(&population)
    }
}
