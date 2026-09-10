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

use self::model::TrinityApp;

struct TerminalCleaner;

impl Drop for TerminalCleaner {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
        let _ = execute!(stdout(), LeaveAlternateScreen);
    }
}

fn handle_key_code(app: &mut TrinityApp, code: KeyCode) -> bool {
    match code {
        KeyCode::Char('q') | KeyCode::Esc => true,
        KeyCode::Char('s') | KeyCode::Tab => {
            app.toggle_dashboard();
            false
        }
        KeyCode::Char('r') => {
            app.restart();
            false
        }
        KeyCode::Char('1') => {
            app.focus_world(1);
            false
        }
        KeyCode::Char('2') => {
            app.focus_world(2);
            false
        }
        KeyCode::Char('3') => {
            app.focus_world(3);
            false
        }
        _ => false,
    }
}

type TuiTerminal = Terminal<CrosstermBackend<std::io::Stdout>>;

fn setup_terminal() -> Result<TuiTerminal, String> {
    enable_raw_mode().map_err(|e| format!("Enable raw mode error: {e}"))?;
    execute!(stdout(), EnterAlternateScreen).map_err(|e| format!("Enter alternate screen: {e}"))?;
    let backend = CrosstermBackend::new(stdout());
    let mut terminal = Terminal::new(backend).map_err(|e| format!("Init terminal error: {e}"))?;
    terminal.clear().map_err(|e| format!("Clear error: {e}"))?;
    Ok(terminal)
}

fn process_step(terminal: &mut TuiTerminal, app: &mut TrinityApp, last_tick: &mut Instant) -> Result<bool, String> {
    terminal.draw(|frame| view::render(frame, app)).map_err(|e| format!("Draw error: {e}"))?;
    let tick_rate = Duration::from_millis(450);
    let timeout = tick_rate.saturating_sub(last_tick.elapsed());
    if event::poll(timeout).unwrap_or(false) {
        if let Ok(Event::Key(key)) = event::read() {
            if handle_key_code(app, key.code) {
                return Ok(true);
            }
        }
    }
    if last_tick.elapsed() >= tick_rate {
        app.tick();
        *last_tick = Instant::now();
    }
    Ok(false)
}

pub fn run(mission_id: &str, prompt: &str, _simulation: bool) -> Result<(), String> {
    let _cleaner = TerminalCleaner;
    let mut terminal = setup_terminal()?;
    let mut app = TrinityApp::new(mission_id, prompt);
    let mut last_tick = Instant::now();

    while !process_step(&mut terminal, &mut app, &mut last_tick)? {}
    Ok(())
}
