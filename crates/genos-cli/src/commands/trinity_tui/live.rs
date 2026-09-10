use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::sync::mpsc::{channel, Receiver, TryRecvError};
use std::thread;
use std::time::Duration;

use serde_json::Value;

const RECONNECT_DELAY: Duration = Duration::from_millis(1500);

/// Connection lifecycle notifications surfaced to the UI thread.
pub enum ConnectionStatus {
    Connected,
    Disconnected(String),
}

/// Background TCP client streaming NDJSON Trinity events from the Node.js
/// runtime (`backend/src/services/trinityMonitorServer.js`) into channels the
/// ratatui event loop can poll without blocking rendering.
pub struct LiveMonitor {
    events_rx: Receiver<Value>,
    status_rx: Receiver<ConnectionStatus>,
}

impl LiveMonitor {
    pub fn connect(host: &str, port: u16, mission_id: Option<String>) -> Self {
        let (events_tx, events_rx) = channel::<Value>();
        let (status_tx, status_rx) = channel::<ConnectionStatus>();
        let host = host.to_string();

        thread::spawn(move || loop {
            match TcpStream::connect((host.as_str(), port)) {
                Ok(mut stream) => {
                    let _ = status_tx.send(ConnectionStatus::Connected);
                    let subscribe = serde_json::json!({ "subscribe": mission_id.clone().unwrap_or_else(|| "latest".to_string()) });
                    if writeln!(stream, "{}", subscribe).is_err() {
                        let _ = status_tx.send(ConnectionStatus::Disconnected("write failed".to_string()));
                        thread::sleep(RECONNECT_DELAY);
                        continue;
                    }
                    let reader = match stream.try_clone() {
                        Ok(clone) => BufReader::new(clone),
                        Err(_) => {
                            thread::sleep(RECONNECT_DELAY);
                            continue;
                        }
                    };
                    for line in reader.lines() {
                        match line {
                            Ok(text) => {
                                let trimmed = text.trim();
                                if trimmed.is_empty() {
                                    continue;
                                }
                                if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
                                    if events_tx.send(value).is_err() {
                                        return;
                                    }
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    let _ = status_tx.send(ConnectionStatus::Disconnected(
                        "connection closed by monitor server".to_string(),
                    ));
                }
                Err(error) => {
                    let _ = status_tx.send(ConnectionStatus::Disconnected(error.to_string()));
                }
            }
            thread::sleep(RECONNECT_DELAY);
        });

        Self { events_rx, status_rx }
    }

    /// Drain every buffered event without blocking the render loop.
    pub fn drain_events(&self) -> Vec<Value> {
        let mut events = Vec::new();
        loop {
            match self.events_rx.try_recv() {
                Ok(value) => events.push(value),
                Err(TryRecvError::Empty) | Err(TryRecvError::Disconnected) => break,
            }
        }
        events
    }

    /// Return the most recent connection status transition, if any occurred.
    pub fn latest_status(&self) -> Option<ConnectionStatus> {
        let mut last = None;
        while let Ok(status) = self.status_rx.try_recv() {
            last = Some(status);
        }
        last
    }
}
