use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};
use super::model::RhizomeSim;

pub fn render(frame: &mut Frame, sim: &RhizomeSim) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5),  // Header + Hook X
            Constraint::Min(12),    // Visual Graph Canvas
            Constraint::Length(7),  // Telemetry & Events
            Constraint::Length(1),  // Footer controls
        ])
        .split(frame.area());

    render_header(frame, chunks[0], sim);
    render_canvas(frame, chunks[1], sim);
    render_telemetry(frame, chunks[2], sim);
    render_footer(frame, chunks[3]);
}

fn render_header(frame: &mut Frame, area: Rect, sim: &RhizomeSim) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Green))
        .title(" [ GENOS RHIZOME : DYNAMIC GRAPH BUDDING & CONTRACTION ] ");

    let header_lines = vec![
        Line::from(vec![
            Span::styled("✨ THE HOOK X: ", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
            Span::styled(
                format!("\"{}\"", sim.hook_text),
                Style::default().fg(Color::Cyan).add_modifier(Modifier::ITALIC),
            ),
        ]),
        Line::from(vec![
            Span::styled("Mechanism: ", Style::default().fg(Color::Gray)),
            Span::styled("Decentralized boundary sensing -> ephemeral offshoot sprout -> cryptographic evidence -> harmless contraction.", Style::default().fg(Color::White)),
        ]),
    ];

    let paragraph = Paragraph::new(header_lines).block(block);
    frame.render_widget(paragraph, area);
}

fn render_canvas(frame: &mut Frame, area: Rect, sim: &RhizomeSim) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan))
        .title(format!(" [ TOPOLOGY CANVAS - {} ] ", sim.phase));

    let has_offshoot = sim.nodes.iter().any(|n| n.id == 3 && n.alpha > 0.1);
    let has_bridge = sim.nodes.iter().any(|n| n.id == 4 && n.alpha > 0.1);

    let canvas_text = build_canvas_lines(has_offshoot, has_bridge, sim);
    let paragraph = Paragraph::new(canvas_text).block(block);
    frame.render_widget(paragraph, area);
}

fn build_canvas_lines<'a>(offshoot: bool, bridge: bool, sim: &'a RhizomeSim) -> Vec<Line<'a>> {
    let mut lines = Vec::new();
    lines.push(Line::from(""));

    if offshoot && bridge {
        lines.push(Line::from(vec![
            Span::raw("                       "),
            Span::styled("┌───────────────────────────┐", Style::default().fg(Color::Blue)),
            Span::raw("     "),
            Span::styled("┌───────────────────────────────┐", Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)),
        ]));
        lines.push(Line::from(vec![
            Span::raw("                       "),
            Span::styled("│   [4] Local Bridge        │", Style::default().fg(Color::Blue).add_modifier(Modifier::BOLD)),
            Span::styled(" <──> ", Style::default().fg(Color::Yellow)),
            Span::styled("│ [3] Capability Offshoot       │", Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)),
        ]));
        lines.push(Line::from(vec![
            Span::raw("                       "),
            Span::styled("│   (Decentralized Bypass)  │", Style::default().fg(Color::LightBlue)),
            Span::raw("     "),
            Span::styled("│     (Ad-hoc OAuth2 Engine)    │", Style::default().fg(Color::LightMagenta)),
        ]));
        lines.push(Line::from(vec![
            Span::raw("                       "),
            Span::styled("└─────────────┬─────────────┘", Style::default().fg(Color::Blue)),
            Span::raw("     "),
            Span::styled("└───────────────┬───────────────┘", Style::default().fg(Color::Magenta)),
        ]));
        lines.push(Line::from(vec![
            Span::raw("                                     ▲                           ▲"),
        ]));
        lines.push(Line::from(vec![
            Span::raw("                                     │ (Dynamic Bridge Pulse)    │ (Boundary Offshoot)"),
        ]));
        lines.push(Line::from(vec![
            Span::raw("                                     ▼                           ▼"),
        ]));
    } else {
        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::raw("                       "),
            Span::styled("[ No Ephemeral Nodes Sprouted - Graph In Rest State ]", Style::default().fg(Color::DarkGray)),
        ]));
        lines.push(Line::from(""));
    }

    let scout_color = if sim.step >= 3 && sim.step <= 5 {
        Color::Yellow
    } else if sim.step >= 9 && sim.step <= 11 {
        Color::Green
    } else {
        Color::Cyan
    };

    lines.push(Line::from(vec![
        Span::raw("    "),
        Span::styled("┌──────────────────────────────────┐", Style::default().fg(Color::Green)),
        Span::styled("                      ", Style::default()),
        Span::styled("┌──────────────────────────────────┐", Style::default().fg(scout_color)),
    ]));
    lines.push(Line::from(vec![
        Span::raw("    "),
        Span::styled("│   [1] Rootless Coordinator       │", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        Span::styled(" <══════════════════> ", Style::default().fg(Color::White)),
        Span::styled("│   [2] Boundary Scout             │", Style::default().fg(scout_color).add_modifier(Modifier::BOLD)),
    ]));
    lines.push(Line::from(vec![
        Span::raw("    "),
        Span::styled("│   (Zero-Centralized Bottleneck)  │", Style::default().fg(Color::LightGreen)),
        Span::raw("                      "),
        Span::styled("│   (External Frontier Sensor)     │", Style::default().fg(scout_color)),
    ]));
    lines.push(Line::from(vec![
        Span::raw("    "),
        Span::styled("└──────────────────────────────────┘", Style::default().fg(Color::Green)),
        Span::raw("                      "),
        Span::styled("└──────────────────────────────────┘", Style::default().fg(scout_color)),
    ]));

    lines
}

fn render_telemetry(frame: &mut Frame, area: Rect, sim: &RhizomeSim) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Yellow))
        .title(format!(" [ REAL-TIME TELEMETRY - Target: {} ] ", sim.api_gap));

    let mut lines = Vec::new();
    let max_logs = (area.height as usize).saturating_sub(2);
    let skip_count = sim.logs.len().saturating_sub(max_logs);

    for log_str in sim.logs.iter().skip(skip_count) {
        let color = if log_str.contains("⚠️") {
            Color::LightRed
        } else if log_str.contains("🌱") || log_str.contains("🌉") {
            Color::LightMagenta
        } else if log_str.contains("🛡️") || log_str.contains("✨") {
            Color::LightGreen
        } else {
            Color::Gray
        };
        lines.push(Line::from(Span::styled(log_str, Style::default().fg(color))));
    }

    let paragraph = Paragraph::new(lines).block(block).wrap(Wrap { trim: false });
    frame.render_widget(paragraph, area);
}

fn render_footer(frame: &mut Frame, area: Rect) {
    let line = Line::from(vec![
        Span::styled(" [q] ", Style::default().fg(Color::Black).bg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("Quit  ", Style::default().fg(Color::White)),
        Span::styled(" [r] ", Style::default().fg(Color::Black).bg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("Restart  ", Style::default().fg(Color::White)),
        Span::styled(" [g] ", Style::default().fg(Color::Black).bg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("Export Animated GIF  ", Style::default().fg(Color::White)),
        Span::styled(" [Space] ", Style::default().fg(Color::Black).bg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("Toggle Pause", Style::default().fg(Color::White)),
    ]);
    frame.render_widget(Paragraph::new(line), area);
}
