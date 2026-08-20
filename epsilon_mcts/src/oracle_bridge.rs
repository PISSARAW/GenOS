use pyo3::prelude::*;
use pyo3::types::PyList;

pub struct OracleBridge {}

impl OracleBridge {
    pub fn new() -> Self {
        pyo3::prepare_freethreaded_python();
        OracleBridge {}
    }

    pub fn should_prune(&self, grid: &[u32; 20]) -> bool {
        Python::with_gil(|py| {
            let sys = py.import("sys").expect("Failed to import sys");
            let path = sys.getattr("path").expect("Failed to get sys.path");
            path.call_method1("append", (".",)).expect("Failed to append to path");
            
            let oracle_mod = py.import("oracle").unwrap_or_else(|e| {
                e.print(py);
                panic!("Failed to import oracle.py");
            });
            
            let evaluate_branch = oracle_mod.getattr("evaluate_branch").expect("Failed to get function");
            
            let py_list = PyList::new(py, grid.iter());
            let result: f64 = evaluate_branch.call1((py_list,)).expect("Call failed").extract().expect("Extract failed");
            
            result < 0.2
        })
    }
}
