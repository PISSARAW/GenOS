use super::join_all;
use std::sync::atomic::{AtomicBool,Ordering};

#[test]
fn an_error_does_not_skip_joining_the_sibling_worker() {
    let settled=AtomicBool::new(false);
    std::thread::scope(|scope| {
        let first=scope.spawn(||Err("first worker failed".into()));
        let second=scope.spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(20));
            settled.store(true,Ordering::SeqCst);
            Ok(())
        });
        let mut error=None;
        join_all(vec![first,second],&mut error);
        assert_eq!(error.as_deref(),Some("first worker failed"));
        assert!(settled.load(Ordering::SeqCst));
    });
}

#[test]
fn a_panic_is_reported_after_every_sibling_has_been_joined() {
    let settled=AtomicBool::new(false);
    std::thread::scope(|scope| {
        let first=scope.spawn(||panic!("controlled worker panic in join probe"));
        let second=scope.spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(20));
            settled.store(true,Ordering::SeqCst);
            Ok(())
        });
        let mut error=None;
        join_all(vec![first,second],&mut error);
        assert!(error.unwrap().contains("AGENTIC_PARALLEL_WORKER_PANICKED"));
        assert!(settled.load(Ordering::SeqCst));
    });
}
