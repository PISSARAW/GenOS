use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::sync::mpsc::{channel, Receiver, TryRecvError};
use std::thread;
use std::time::Duration;

use serde_json::Value;

const RECONNECT_DELAY: Duration = Duration::from_millis(1500);
const RECONNECT_MAX_DELAY: Duration = Duration::from_millis(30_000);

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

        thread::spawn(move || {
            let mut backoff = RECONNECT_DELAY;
            loop {
                let mut received_any = false;
                let mut dropped_lines: u64 = 0;
                match TcpStream::connect((host.as_str(), port)) {
                    Ok(mut stream) => {
                        let _ = status_tx.send(ConnectionStatus::Connected);
                        let subscribe = serde_json::json!({ "subscribe": mission_id.clone().unwrap_or_else(|| "latest".to_string()) });
                        if writeln!(stream, "{}", subscribe).is_err() {
                            let _ = status_tx.send(ConnectionStatus::Disconnected("write failed".to_string()));
                            thread::sleep(backoff);
                            backoff = (backoff * 2).min(RECONNECT_MAX_DELAY);
                            continue;
                        }
                        let reader = match stream.try_clone() {
                            Ok(clone) => BufReader::new(clone),
                            Err(_) => {
                                thread::sleep(backoff);
                                backoff = (backoff * 2).min(RECONNECT_MAX_DELAY);
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
                                        received_any = true;
                                        if events_tx.send(value).is_err() {
                                            return;
                                        }
                                    } else {
                                        // Surface the first malformed line instead of
                                        // discarding it silently.
                                        dropped_lines += 1;
                                        if dropped_lines == 1 {
                                            let warning = serde_json::json!({
                                                "type": "monitor_warning",
                                                "message": "Ignoring non-JSON line from Trinity monitor",
                                            });
                                            let _ = events_tx.send(warning);
                                        }
                                    }
                                }
                                Err(_) => break,
                            }
                        }
                        let detail = if dropped_lines > 0 {
                            format!("connection closed by monitor server ({dropped_lines} non-JSON line(s) dropped)")
                        } else {
                            "connection closed by monitor server".to_string()
                        };
                        let _ = status_tx.send(ConnectionStatus::Disconnected(detail));
                    }
                    Err(error) => {
                        let _ = status_tx.send(ConnectionStatus::Disconnected(error.to_string()));
                    }
                }
                if received_any {
                    backoff = RECONNECT_DELAY;
                }
                thread::sleep(backoff);
                backoff = (backoff * 2).min(RECONNECT_MAX_DELAY);
            }
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
