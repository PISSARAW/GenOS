pub mod gif_export;
pub mod model;
pub mod view;

use std::io::stdout;
use std::time::{Duration, Instant};
use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use self::model::RhizomeSim;

pub use gif_export::generate_gif;

type TuiTerminal = Terminal<CrosstermBackend<std::io::Stdout>>;

struct TerminalCleaner;

impl Drop for TerminalCleaner {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
        let _ = execute!(stdout(), LeaveAlternateScreen);
    }
}

fn handle_key_code(sim: &mut RhizomeSim, code: KeyCode) -> bool {
    match code {
        KeyCode::Char('q') | KeyCode::Esc => true,
        KeyCode::Char('r') => {
            sim.restart();
            false
        }
        KeyCode::Char('g') => {
            let _ = generate_gif("artifacts/rhizome_simulation.gif");
            false
        }
        KeyCode::Char(' ') => {
            sim.tick();
            false
        }
        _ => false,
    }
}

fn setup_terminal() -> Result<TuiTerminal, String> {
    enable_raw_mode().map_err(|e| format!("Enable raw mode error: {e}"))?;
    execute!(stdout(), EnterAlternateScreen).map_err(|e| format!("Enter alternate screen error: {e}"))?;
    let backend = CrosstermBackend::new(stdout());
    let mut terminal = Terminal::new(backend).map_err(|e| format!("Init terminal error: {e}"))?;
    terminal.clear().map_err(|e| format!("Clear error: {e}"))?;
    Ok(terminal)
}

fn process_step(terminal: &mut TuiTerminal, sim: &mut RhizomeSim, last_tick: &mut Instant) -> Result<bool, String> {
    terminal.draw(|frame| view::render(frame, sim)).map_err(|e| format!("Draw error: {e}"))?;
    let tick_rate = Duration::from_millis(500);
    let timeout = tick_rate.saturating_sub(last_tick.elapsed());

    if event::poll(timeout).unwrap_or(false) {
        if let Ok(Event::Key(key)) = event::read() {
            if handle_key_code(sim, key.code) {
                return Ok(true);
            }
        }
    }

    if last_tick.elapsed() >= tick_rate {
        sim.tick();
        *last_tick = Instant::now();
    }
    Ok(false)
}

pub fn run(gif_path: Option<&str>) -> Result<(), String> {
    if let Some(path) = gif_path {
        let _ = generate_gif(path);
    }

    let _cleaner = TerminalCleaner;
    let mut terminal = setup_terminal()?;
    let mut sim = RhizomeSim::new();
    let mut last_tick = Instant::now();

    while !process_step(&mut terminal, &mut sim, &mut last_tick)? {}
    Ok(())
}
