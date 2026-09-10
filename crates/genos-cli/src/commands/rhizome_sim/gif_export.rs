use std::fs::File;
use std::path::Path;
use gif::{Encoder, Frame, Repeat};
use super::model::RhizomeSim;

const WIDTH: usize = 500;
const HEIGHT: usize = 280;

fn build_palette() -> &'static [u8] {
    &[
        11, 15, 25,    // 0: Background dark
        22, 32, 54,    // 1: Panel background
        38, 54, 87,    // 2: Grid & edges
        248, 250, 252, // 3: Text bright
        148, 163, 184, // 4: Text muted
        16, 185, 129,  // 5: Green (Coordinator / Validated)
        5, 150, 105,   // 6: Dark Green
        6, 182, 212,   // 7: Cyan (Boundary Scout)
        8, 145, 178,   // 8: Dark Cyan
        245, 158, 11,  // 9: Orange (API Gap alert)
        239, 68, 68,   // 10: Red
        217, 70, 239,  // 11: Magenta (Capability Offshoot)
        168, 85, 247,  // 12: Dark Magenta
        59, 130, 246,  // 13: Blue (Local Bridge)
        37, 99, 235,   // 14: Dark Blue
        251, 191, 36,  // 15: Gold
    ]
}

fn draw_rect(buf: &mut [u8], r: (usize, usize, usize, usize), color: u8) {
    let (x0, y0, w, h) = r;
    let x_end = (x0 + w).min(WIDTH);
    let y_end = (y0 + h).min(HEIGHT);
    for y in y0..y_end {
        let row_offset = y * WIDTH;
        for x in x0..x_end {
            buf[row_offset + x] = color;
        }
    }
}

fn draw_circle(buf: &mut [u8], c: (usize, usize, usize), color: u8) {
    let (cx, cy, r) = c;
    let r_sq = (r * r) as i32;
    let min_x = cx.saturating_sub(r);
    let max_x = (cx + r).min(WIDTH - 1);
    let min_y = cy.saturating_sub(r);
    let max_y = (cy + r).min(HEIGHT - 1);

    for y in min_y..=max_y {
        let dy = y as i32 - cy as i32;
        let row_offset = y * WIDTH;
        for x in min_x..=max_x {
            let dx = x as i32 - cx as i32;
            if dx * dx + dy * dy <= r_sq {
                buf[row_offset + x] = color;
            }
        }
    }
}

fn draw_line(buf: &mut [u8], l: (usize, usize, usize, usize), color: u8) {
    let (x0, y0, x1, y1) = l;
    let mut curr_x = x0 as i32;
    let mut curr_y = y0 as i32;
    let dest_x = x1 as i32;
    let dest_y = y1 as i32;
    let dx = (dest_x - curr_x).abs();
    let dy = -(dest_y - curr_y).abs();
    let sx = if curr_x < dest_x { 1 } else { -1 };
    let sy = if curr_y < dest_y { 1 } else { -1 };
    let mut err = dx + dy;

    loop {
        if curr_x >= 0 && (curr_x as usize) < WIDTH && curr_y >= 0 && (curr_y as usize) < HEIGHT {
            buf[curr_y as usize * WIDTH + curr_x as usize] = color;
        }
        if curr_x == dest_x && curr_y == dest_y {
            break;
        }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            curr_x += sx;
        }
        if e2 <= dx {
            err += dx;
            curr_y += sy;
        }
    }
}

fn draw_edge_layer(buf: &mut [u8], sim: &RhizomeSim) {
    for edge in &sim.edges {
        if edge.alpha <= 0.05 {
            continue;
        }
        let from_node = sim.nodes.iter().find(|n| n.id == edge.from);
        let to_node = sim.nodes.iter().find(|n| n.id == edge.to);
        if let (Some(n1), Some(n2)) = (from_node, to_node) {
            let x0 = (n1.x * WIDTH as f32) as usize;
            let y0 = (n1.y * HEIGHT as f32) as usize;
            let x1 = (n2.x * WIDTH as f32) as usize;
            let y1 = (n2.y * HEIGHT as f32) as usize;
            let edge_color = if edge.alpha > 0.8 { 3 } else { 2 };
            draw_line(buf, (x0, y0, x1, y1), edge_color);
        }
    }
}

fn draw_node_layer(buf: &mut [u8], sim: &RhizomeSim) {
    for node in &sim.nodes {
        if node.alpha <= 0.05 {
            continue;
        }
        let cx = (node.x * WIDTH as f32) as usize;
        let cy = (node.y * HEIGHT as f32) as usize;
        let r = (16.0 * node.alpha) as usize;
        if r > 2 {
            let halo_color = (node.color_idx + 1).min(15);
            draw_circle(buf, (cx, cy, r + 4), halo_color);
            draw_circle(buf, (cx, cy, r), node.color_idx);
            draw_circle(buf, (cx, cy, r.saturating_sub(4)), 3); // Core highlight
        }
    }
}

fn render_frame(sim: &RhizomeSim) -> Vec<u8> {
    let mut buf = vec![0u8; WIDTH * HEIGHT];
    draw_rect(&mut buf, (0, 0, WIDTH, 34), 1); // Header banner
    draw_rect(&mut buf, (0, 34, WIDTH, 2), 2);
    draw_rect(&mut buf, (0, HEIGHT - 45, WIDTH, 45), 1); // Footer log panel
    draw_rect(&mut buf, (0, HEIGHT - 45, WIDTH, 2), 2);

    draw_edge_layer(&mut buf, sim);
    draw_node_layer(&mut buf, sim);

    buf
}

pub fn generate_gif(output_path: &str) -> Result<String, String> {
    let path = Path::new(output_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Create dir error: {e}"))?;
    }
    let mut file = File::create(path).map_err(|e| format!("Create file error: {e}"))?;
    let palette = build_palette();
    let mut encoder = Encoder::new(&mut file, WIDTH as u16, HEIGHT as u16, palette)
        .map_err(|e| format!("Encoder init error: {e}"))?;
    encoder.set_repeat(Repeat::Infinite).map_err(|e| format!("Set repeat error: {e}"))?;

    let mut sim = RhizomeSim::new();
    for _ in 0..=sim.max_steps {
        let pixels = render_frame(&sim);
        let mut frame = Frame::from_indexed_pixels(WIDTH as u16, HEIGHT as u16, pixels, None);
        frame.delay = 25; // 250ms per frame
        encoder.write_frame(&frame).map_err(|e| format!("Write frame error: {e}"))?;
        sim.tick();
    }

    Ok(output_path.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gif_palette_and_render() {
        let palette = build_palette();
        assert_eq!(palette.len(), 16 * 3);
        let sim = RhizomeSim::new();
        let frame = render_frame(&sim);
        assert_eq!(frame.len(), WIDTH * HEIGHT);
    }
}
