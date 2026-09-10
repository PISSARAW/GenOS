use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Cell, Gauge, Paragraph, Row, Table, Wrap},
    Frame,
};

use super::model::{TrinityApp, WorldState};

pub fn render(frame: &mut Frame, app: &TrinityApp) {
    let size = frame.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5),  // Header
            Constraint::Min(12),   // 3 Columns Split-Screen
            Constraint::Length(7),  // Evidence Barrier Dashboard summary
            Constraint::Length(2),  // Footer keybindings
        ])
        .split(size);

    render_header(frame, chunks[0], app);

    if !app.live && app.show_dashboard && app.completed {
        render_full_dashboard(frame, chunks[1], app);
    } else {
        render_columns(frame, chunks[1], app);
    }

    render_summary_dashboard(frame, chunks[2], app);
    render_footer(frame, chunks[3], app);
}

fn render_header(frame: &mut Frame, area: Rect, app: &TrinityApp) {
    let elapsed = app.start_time.elapsed().as_secs();
    let status_str = if app.completed { "✔ COMPLETED" } else { "● EXECUTING" };
    let status_color = if app.completed { Color::Green } else { Color::Cyan };

    let mode_line = if app.live {
        let (dot, color) = if app.connected { ("● LIVE", Color::Green) } else { ("○ RECONNECTING", Color::Red) };
        Line::from(vec![
            Span::styled(format!(" {dot} "), Style::default().fg(color).add_modifier(Modifier::BOLD)),
            Span::styled(app.connection_message.clone(), Style::default().fg(Color::DarkGray)),
        ])
    } else {
        Line::from(vec![
            Span::styled(" ○ SIMULATION ", Style::default().fg(Color::DarkGray).add_modifier(Modifier::BOLD)),
            Span::styled("Deterministic demo narrative (not connected to a live mission)", Style::default().fg(Color::DarkGray)),
        ])
    };

    let header_text = vec![
        Line::from(vec![
            Span::styled(" ⚡ GENOS TRINITY ", Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD)),
            Span::styled(" // COUNTERFACTUAL MULTI-AGENT ENGINE (V3) ", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
            Span::styled(format!("[{status_str} | {elapsed}s] "), Style::default().fg(status_color).add_modifier(Modifier::BOLD)),
            Span::styled(format!("Mission: {} ", app.mission_id), Style::default().fg(Color::DarkGray)),
        ]),
        mode_line,
        Line::from(vec![
            Span::styled("Prompt: ", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
            Span::styled(&app.prompt, Style::default().fg(Color::LightYellow)),
        ]),
    ];

    let header_block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));
    let paragraph = Paragraph::new(header_text).block(header_block);
    frame.render_widget(paragraph, area);
}

fn render_columns(frame: &mut Frame, area: Rect, app: &TrinityApp) {
    if let Some(focused) = app.focused_world {
        let idx = (focused.saturating_sub(1) as usize).min(app.worlds.len() - 1);
        render_single_world(frame, area, &app.worlds[idx]);
        return;
    }

    let col_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(33),
            Constraint::Percentage(34),
            Constraint::Percentage(33),
        ])
        .split(area);

    for (i, world) in app.worlds.iter().enumerate() {
        if i < col_chunks.len() {
            render_single_world(frame, col_chunks[i], world);
        }
    }
}

fn render_single_world(frame: &mut Frame, area: Rect, world: &WorldState) {
    let border_color = match world.id {
        1 => Color::Yellow,
        2 => Color::Blue,
        _ => Color::Green,
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(4), // Progress and meta
            Constraint::Min(5),    // Log scroll
            Constraint::Length(3), // Verdict footer
        ])
        .split(area);

    let title = format!(" [ {} - {} ({}) ] ", world.title, world.subtitle, world.strategy);
    let outer_block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(border_color));
    frame.render_widget(outer_block, area);

    // Meta & Gauge
    let meta_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(2), Constraint::Length(2)])
        .split(chunks[0]);

    let gauge = Gauge::default()
        .block(Block::default().borders(Borders::NONE))
        .gauge_style(Style::default().fg(border_color).bg(Color::DarkGray))
        .percent(world.progress)
        .label(format!("{}% | {} tok | {}", world.progress, world.tokens, world.model_tier));
    frame.render_widget(gauge, meta_chunks[0]);

    let hypo_text = vec![Line::from(vec![
        Span::styled("Hypothesis: ", Style::default().fg(Color::Yellow)),
        Span::styled(&world.hypothesis, Style::default().fg(Color::White)),
    ])];
    let hypo_para = Paragraph::new(hypo_text);
    frame.render_widget(hypo_para, meta_chunks[1]);

    // Logs
    let mut log_lines: Vec<Line> = Vec::new();
    let max_lines = (chunks[1].height as usize).saturating_sub(1);
    let skip_count = world.logs.len().saturating_sub(max_lines);
    for line_str in world.logs.iter().skip(skip_count) {
        let color = if line_str.contains("WARNING") || line_str.contains("overflow") {
            Color::LightRed
        } else if line_str.contains("WINNER") || line_str.contains("passed") {
            Color::LightGreen
        } else if line_str.contains("Patch") || line_str.contains("Zero-copy") {
            Color::LightCyan
        } else {
            Color::Gray
        };
        log_lines.push(Line::from(Span::styled(line_str, Style::default().fg(color))));
    }
    let log_para = Paragraph::new(log_lines).wrap(Wrap { trim: false });
    frame.render_widget(log_para, chunks[1]);

    // Verdict footer
    let verdict_color = if world.verdict.contains("WINNER") {
        Color::Green
    } else if world.verdict.contains("COMPATIBLE") {
        Color::Cyan
    } else if world.verdict.contains("REJECTED") {
        Color::Red
    } else {
        Color::DarkGray
    };
    let verdict_text = vec![Line::from(vec![
        Span::styled("Verdict: ", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled(&world.verdict, Style::default().fg(verdict_color).add_modifier(Modifier::BOLD)),
        Span::styled(format!(" | Score: {:.2}", world.evidence_score), Style::default().fg(Color::Yellow)),
    ])];
    let verdict_para = Paragraph::new(verdict_text);
    frame.render_widget(verdict_para, chunks[2]);
}

fn render_summary_dashboard(frame: &mut Frame, area: Rect, app: &TrinityApp) {
    let title = if app.live {
        format!(" [ EVIDENCE BARRIER — {} ] {} ", app.barrier_status, app.barrier_detail)
    } else {
        " [ UNIFIED EVIDENCE BARRIER & DIVERGENCE DASHBOARD ] ".to_string()
    };
    let barrier_color = match app.barrier_status.as_str() {
        "SATISFIED" => Color::Green,
        "PARTIAL" | "WAITING" => Color::Yellow,
        "HALTED" | "FAILED" => Color::Red,
        _ => Color::Magenta,
    };
    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(if app.live { barrier_color } else { Color::Magenta }));

    let header_cells = ["World", "Strategy", "Findings & Defense", "Evidence Score", "Verdict"]
        .into_iter()
        .map(|h| Cell::from(h).style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)));
    let header = Row::new(header_cells).height(1);

    let rows: Vec<Row> = app.worlds.iter().map(|w| {
        let findings = w.key_findings.join(", ");
        let display_findings = if findings.is_empty() { "Processing hypothesis...".to_string() } else { findings };
        let verdict_style = if w.verdict.contains("WINNER") {
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)
        } else if w.verdict.contains("REJECTED") {
            Style::default().fg(Color::Red)
        } else {
            Style::default().fg(Color::Cyan)
        };

        Row::new(vec![
            Cell::from(w.title.clone()),
            Cell::from(w.subtitle.clone()),
            Cell::from(display_findings),
            Cell::from(format!("{:.2}", w.evidence_score)),
            Cell::from(w.verdict.clone()).style(verdict_style),
        ])
    }).collect();

    let table = Table::new(
        rows,
        [
            Constraint::Percentage(18),
            Constraint::Percentage(22),
            Constraint::Percentage(35),
            Constraint::Percentage(12),
            Constraint::Percentage(13),
        ],
    )
    .header(header)
    .block(block);

    frame.render_widget(table, area);
}

fn render_full_dashboard(frame: &mut Frame, area: Rect, _app: &TrinityApp) {
    let block = Block::default()
        .title(" [ CAUSAL DIVERGENCE ANALYSIS & OFFICIAL SYNTHESIS ] ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Green));

    let content = vec![
        Line::from(vec![
            Span::styled("🔬 Causal Divergence Point: ", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
            Span::styled("Hostile boundaries (i64 overflow, unexpected EOF, non-canonical key sorting).", Style::default().fg(Color::White)),
        ]),
        Line::from(vec![
            Span::styled("   • World 1 (Naïf): ", Style::default().fg(Color::Yellow)),
            Span::styled("Silent stack overflow vulnerabilities on recursive nesting. Misses BEP 0003 zero rules. (Score: 0.72)", Style::default().fg(Color::LightRed)),
        ]),
        Line::from(vec![
            Span::styled("   • World 2 (Planifié): ", Style::default().fg(Color::Blue)),
            Span::styled("Zero-copy AST + 18/18 canonical vector validation. Enforces depth limit 128. (Score: 0.94)", Style::default().fg(Color::LightCyan)),
        ]),
        Line::from(vec![
            Span::styled("   • World 3 (Auto-corrigé): ", Style::default().fg(Color::Green)),
            Span::styled("Attacked with adversarial fuzzing; neutralized 4 critical bugs with checked arithmetic. (Score: 0.98)", Style::default().fg(Color::LightGreen)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("🏆 OFFICIAL UNIFIED SYNTHESIS: ", Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)),
            Span::styled("Synthesizing World 3's fuzzed/hardened parser engine with World 2's zero-copy slice AST representation.", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(vec![
            Span::styled("   Gate Status: ", Style::default().fg(Color::White)),
            Span::styled("PASSED EVIDENCE BARRIER -> READY FOR PROMOTION TO REPOSITORY ROOT.", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        ]),
    ];

    let paragraph = Paragraph::new(content).block(block).wrap(Wrap { trim: false });
    frame.render_widget(paragraph, area);
}

fn render_footer(frame: &mut Frame, area: Rect, _app: &TrinityApp) {
    let line = Line::from(vec![
        Span::styled(" [q] ", Style::default().fg(Color::Black).bg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("Quit  ", Style::default().fg(Color::White)),
        Span::styled(" [s/Tab] ", Style::default().fg(Color::Black).bg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("Toggle Dashboard  ", Style::default().fg(Color::White)),
        Span::styled(" [1/2/3] ", Style::default().fg(Color::Black).bg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("Focus Column  ", Style::default().fg(Color::White)),
        Span::styled(" [r] ", Style::default().fg(Color::Black).bg(Color::White).add_modifier(Modifier::BOLD)),
        Span::styled("Restart Execution  ", Style::default().fg(Color::White)),
    ]);
    let paragraph = Paragraph::new(vec![line]).alignment(Alignment::Center);
    frame.render_widget(paragraph, area);
}
