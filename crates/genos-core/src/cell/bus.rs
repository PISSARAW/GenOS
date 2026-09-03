use crossbeam_channel::{unbounded, Receiver, Sender};
use crate::cell::events::CellEvent;

#[derive(Debug)]
pub struct CellChannel(pub Sender<CellEvent>, pub Receiver<CellEvent>);

impl Clone for CellChannel {
    fn clone(&self) -> Self {
        let (tx, rx) = unbounded();
        Self(tx, rx)
    }
}

impl Default for CellChannel {
    fn default() -> Self {
        let (tx, rx) = unbounded();
        Self(tx, rx)
    }
}
