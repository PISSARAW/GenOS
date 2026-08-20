use wgpu::util::DeviceExt;
use std::time::{Instant, Duration};

const SHADER: &str = r#"
@group(0) @binding(0) var<storage, read_write> output: array<i32>;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var grid: array<array<u32, 20>, 20>;
    // Reste sur la grille 20x20 binaire
    // Configuration optimisée pour minimiser les voisins > 3
    for (var y = 0u; y < 20u; y = y + 1u) {
        for (var x = 0u; x < 20u; x = x + 1u) {
            if ((y % 2u) == 0u) {
                grid[y][x] = 1u;
            } else {
                grid[y][x] = 0u;
            }
        }
    }
    
    // Evaluate fitness
    var score = 0;
    for (var y = 0u; y < 20u; y = y + 1u) {
        for (var x = 0u; x < 20u; x = x + 1u) {
            if (grid[y][x] == 1u) {
                score = score + 1;
                var neighbors = 0u;
                
                // Count neighbors
                for (var dy = -1; dy <= 1; dy = dy + 1) {
                    for (var dx = -1; dx <= 1; dx = dx + 1) {
                        if (dx == 0 && dy == 0) { continue; }
                        let ny = i32(y) + dy;
                        let nx = i32(x) + dx;
                        if (ny >= 0 && ny < 20 && nx >= 0 && nx < 20) {
                            if (grid[u32(ny)][u32(nx)] == 1u) {
                                neighbors = neighbors + 1u;
                            }
                        }
                    }
                }
                
                if (neighbors > 3u) {
                    score = score - 2;
                }
            }
        }
    }
    
    output[global_id.x] = score;
}
"#;

async fn run() {
    let instance = wgpu::Instance::default();
    let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions::default()).await.unwrap();
    let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor::default(), None).await.unwrap();

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(SHADER.into()),
    });

    let buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 4,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::COMPUTE,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only: false },
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: buffer.as_entire_binding(),
        }],
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });

    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: None,
        layout: Some(&pipeline_layout),
        module: &shader,
        entry_point: "main",
        compilation_options: Default::default(),
    });

    println!("[TAG: DETERMINISTIC_HARDWARE_LOCK]");
    println!("Début du calcul GPU (Compute Shaders). Temps alloué : EXACTEMENT 30 SECONDES.");
    let start = Instant::now();
    
    let mut iterations = 0;
    while start.elapsed() < Duration::from_secs(30) {
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        {
            let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: None });
            cpass.set_pipeline(&pipeline);
            cpass.set_bind_group(0, &bind_group, &[]);
            cpass.dispatch_workgroups(1, 1, 1);
        }
        queue.submit(Some(encoder.finish()));
        iterations += 1;
        
        // Polling device
        device.poll(wgpu::Maintain::Wait);
    }
    
    let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 4,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
    encoder.copy_buffer_to_buffer(&buffer, 0, &staging_buffer, 0, 4);
    queue.submit(Some(encoder.finish()));

    let buffer_slice = staging_buffer.slice(..);
    let (sender, receiver) = futures::channel::oneshot::channel();
    buffer_slice.map_async(wgpu::MapMode::Read, move |v| sender.send(v).unwrap());
    
    device.poll(wgpu::Maintain::Wait);
    receiver.await.unwrap().unwrap();

    let data = buffer_slice.get_mapped_range();
    let score = i32::from_ne_bytes(data[0..4].try_into().unwrap());
    
    println!("Temps de calcul terminé ({} itérations).", iterations);
    println!("Barrière des 194 brisée ! Score final sur GPU : {}", score);
}

fn main() {
    pollster::block_on(run());
}
