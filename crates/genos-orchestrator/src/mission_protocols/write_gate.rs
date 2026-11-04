//! Admission locale des transactions SQLite ; aucune autorite ni relance d'effet.
use std::collections::HashMap;
use std::marker::PhantomData;
use std::path::{Path,PathBuf};
use std::rc::Rc;
use std::sync::{Arc,Condvar,Mutex,MutexGuard,OnceLock,Weak};
use std::thread::{self,ThreadId};
use std::time::{Duration,Instant};

static REGISTRY:OnceLock<Mutex<HashMap<PathBuf,Weak<Gate>>>>=OnceLock::new();

#[derive(Default)]
struct State { owner:Option<ThreadId> }

pub(crate) struct Gate { state:Mutex<State>,changed:Condvar }

pub(crate) struct Guard {
    gate:Arc<Gate>,
    owner:ThreadId,
    _thread_bound:PhantomData<Rc<()>>,
}

pub(crate) fn shared(path:&Path) -> Result<Arc<Gate>,String> {
    if path==Path::new(":memory:") { return Ok(Arc::new(Gate::new())); }
    let key=canonical_key(path)?;
    #[cfg(windows)]
    let key=PathBuf::from(key.as_os_str().to_ascii_lowercase());
    let registry=REGISTRY.get_or_init(||Mutex::new(HashMap::new()));
    let mut entries=registry.lock().map_err(|_|"WRITE_GATE_REGISTRY_POISONED")?;
    entries.retain(|_,entry|entry.strong_count()!=0);
    if let Some(gate)=entries.get(&key).and_then(Weak::upgrade) { return Ok(gate); }
    let gate=Arc::new(Gate::new());
    entries.insert(key,Arc::downgrade(&gate));
    Ok(gate)
}

fn canonical_key(path:&Path) -> Result<PathBuf,String> {
    if path.try_exists().map_err(error)? { return path.canonicalize().map_err(error); }
    if path.symlink_metadata().is_ok() { return Err("WRITE_GATE_UNRESOLVED_PATH".into()); }
    let name=path.file_name().ok_or("WRITE_GATE_FILE_NAME_REQUIRED")?;
    let parent=path.parent().filter(|value|!value.as_os_str().is_empty()).unwrap_or_else(||Path::new("."));
    Ok(parent.canonicalize().map_err(error)?.join(name))
}

impl Gate {
    fn new() -> Self { Self { state:Mutex::new(State::default()),changed:Condvar::new() } }

    pub(crate) fn acquire(self:&Arc<Self>, timeout:Duration) -> Result<Guard,String> {
        let deadline=Instant::now().checked_add(timeout).ok_or("WRITE_GATE_DEADLINE_OVERFLOW")?;
        let owner=thread::current().id();
        let mut state=self.state.lock().map_err(|_|"WRITE_GATE_POISONED")?;
        if state.owner==Some(owner) { return Err("WRITE_GATE_REENTRANT".into()); }
        while state.owner.is_some() { state=self.wait_until(state,deadline)?; }
        if Instant::now()>=deadline { return Err("WRITE_GATE_TIMEOUT".into()); }
        state.owner=Some(owner);
        drop(state);
        Ok(Guard { gate:Arc::clone(self),owner,_thread_bound:PhantomData })
    }

    fn wait_until<'a>(&'a self, state:MutexGuard<'a,State>, deadline:Instant) -> Result<MutexGuard<'a,State>,String> {
        let remaining=deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() { return Err("WRITE_GATE_TIMEOUT".into()); }
        let (state,_)=self.changed.wait_timeout(state,remaining).map_err(|_|"WRITE_GATE_POISONED")?;
        Ok(state)
    }
}

impl Drop for Guard {
    fn drop(&mut self) {
        let mut state=match self.gate.state.lock() {
            Ok(state)=>state,Err(poisoned)=>poisoned.into_inner(),
        };
        if state.owner==Some(self.owner) {
            state.owner=None;
            drop(state);
            self.gate.changed.notify_all();
        }
    }
}

fn error(error:impl std::fmt::Display) -> String { format!("WRITE_GATE_PATH: {error}") }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_aliases_share_the_gate_before_and_after_file_creation() {
        let directory=tempfile::tempdir().unwrap();let path=directory.path().join("ledger.sqlite");
        let first=shared(&path).unwrap();
        let alias=shared(&directory.path().join(".").join("ledger.sqlite")).unwrap();
        assert!(Arc::ptr_eq(&first,&alias));
        std::fs::write(&path,b"").unwrap();
        assert!(Arc::ptr_eq(&first,&shared(&path).unwrap()));
    }

    #[cfg(windows)]
    #[test]
    fn windows_case_aliases_share_before_and_after_creation() {
        let directory=tempfile::tempdir().unwrap();
        let lower=directory.path().join("ledger.sqlite");let upper=directory.path().join("LEDGER.SQLITE");
        let first=shared(&lower).unwrap();
        assert!(Arc::ptr_eq(&first,&shared(&upper).unwrap()));
        std::fs::write(&upper,b"").unwrap();
        assert!(Arc::ptr_eq(&first,&shared(&lower).unwrap()));
        assert!(Arc::ptr_eq(&first,&shared(&upper).unwrap()));
    }

    #[test]
    fn memory_databases_and_distinct_files_are_independent() {
        let first=shared(Path::new(":memory:")).unwrap();let second=shared(Path::new(":memory:")).unwrap();
        assert!(!Arc::ptr_eq(&first,&second));
        let directory=tempfile::tempdir().unwrap();
        let one=shared(&directory.path().join("one.sqlite")).unwrap();
        let two=shared(&directory.path().join("two.sqlite")).unwrap();
        let _first=one.acquire(Duration::from_secs(1)).unwrap();
        let _second=two.acquire(Duration::from_secs(1)).unwrap();
    }

    #[test]
    fn same_thread_reentrance_fails_without_deadlocking_another_store() {
        let gate=shared(Path::new(":memory:")).unwrap();let alias=Arc::clone(&gate);
        let first=gate.acquire(Duration::from_secs(1)).unwrap();
        assert_eq!(alias.acquire(Duration::from_secs(1)).err().unwrap(),"WRITE_GATE_REENTRANT");
        drop(first);
        assert!(alias.acquire(Duration::from_secs(1)).is_ok());
    }

    #[test]
    fn occupied_gate_uses_a_fixed_deadline_and_does_not_acquire_after_timeout() {
        let gate=shared(Path::new(":memory:")).unwrap();let first=gate.acquire(Duration::from_secs(1)).unwrap();
        let waiter=Arc::clone(&gate);
        let result=thread::spawn(move || {
            let started=Instant::now();let result=waiter.acquire(Duration::from_millis(30)).err();
            (result,started.elapsed())
        }).join().unwrap();
        assert_eq!(result.0.as_deref(),Some("WRITE_GATE_TIMEOUT"));
        assert!(result.1<Duration::from_secs(2));
        drop(first);
        assert!(gate.acquire(Duration::from_secs(1)).is_ok());
    }

    #[test]
    fn releasing_the_owner_wakes_a_waiting_thread() {
        let gate=shared(Path::new(":memory:")).unwrap();let first=gate.acquire(Duration::from_secs(1)).unwrap();
        let waiter=Arc::clone(&gate);let (send,receive)=std::sync::mpsc::channel();
        let worker=thread::spawn(move || {
            send.send(()).unwrap();
            let _guard=waiter.acquire(Duration::from_secs(2)).unwrap();true
        });
        receive.recv().unwrap();drop(first);
        assert!(worker.join().unwrap());
    }

    #[test]
    fn zero_duration_refuses_even_a_free_gate() {
        let gate=shared(Path::new(":memory:")).unwrap();
        assert_eq!(gate.acquire(Duration::ZERO).err().unwrap(),"WRITE_GATE_TIMEOUT");
    }
}
