use std::sync::Mutex;
use std::sync::Arc;

use differential_dataflow::input::Input;

pub fn sample_invalidation_deltas() -> Vec<(u64, u64, isize)> {
    let events = Arc::new(Mutex::new(Vec::new()));
    let collected = Arc::clone(&events);
    timely::execute_directly(move |worker| {
        let sink = Arc::clone(&collected);
        let (mut edges, probe) = worker.dataflow::<u64, _, _>(|scope| {
            let (input, dependencies) = scope.new_collection::<(u64, u64), isize>();
            let (probe, _) = dependencies
                .filter(|(_, parent)| *parent == 1)
                .map(|(child, _)| child)
                .distinct()
                .inspect(move |(child, time, diff)| sink.lock().unwrap().push((*child, *time, *diff)))
                .probe();
            (input, probe)
        });
        edges.insert((2, 1));
        edges.advance_to(1);
        edges.flush();
        worker.step_while(|| probe.less_than(edges.time()));
        edges.remove((2, 1));
        edges.advance_to(2);
        edges.flush();
        worker.step_while(|| probe.less_than(edges.time()));
    });
    let result = events.lock().unwrap().clone();
    result
}

#[cfg(test)]
mod tests {
    use super::sample_invalidation_deltas;

    #[test]
    fn dependency_addition_and_removal_emit_opposite_deltas() {
        assert_eq!(sample_invalidation_deltas(), vec![(2, 0, 1), (2, 1, -1)]);
    }
}
