const fs = require('fs');

const N = 5;

// Build LUT
const NEXT_LUT = new Uint8Array(2048);
for (let C = 0; C <= 2; C++) {
    for (let ones = 0; ones <= 8; ones++) {
        for (let unks = 0; unks <= 8 - ones; unks++) {
            let can1 = 0, can0 = 0;
            for (let C_val = 0; C_val <= 1; C_val++) {
                if (C !== 2 && C_val !== C) continue;
                for (let u = 0; u <= unks; u++) {
                    let n = ones + u;
                    let next_val = 0;
                    if (C_val === 1 && (n === 2 || n === 3)) next_val = 1;
                    if (C_val === 0 && n === 3) next_val = 1;
                    if (next_val === 1) can1 = 1;
                    else can0 = 1;
                }
            }
            let res = 3;
            if (can1 && can0) res = 2;
            else if (can1) res = 1;
            else if (can0) res = 0;
            NEXT_LUT[(C << 8) | (ones << 4) | unks] = res;
        }
    }
}

let target_grid = [];
let W = 0, H = 0;
try {
    let content = fs.readFileSync('data/target_grid.txt', 'utf-8').trim().split(/\r?\n/);
    H = content.length;
    W = content[0].trim().length;
    for (let y = 0; y < H; y++) {
        let line = content[y].trim();
        for (let x = 0; x < W; x++) {
            target_grid.push(line[x] === '1' ? 1 : 0);
        }
    }
} catch(e) {
    console.log("No target_grid.txt found, generating random 20x20 grid.");
    W = 20; H = 20;
    for (let i = 0; i < W * H; i++) target_grid.push(Math.random() < 0.2 ? 1 : 0);
}

let block_size = Math.min(11, W, H);
let half_block = Math.floor(block_size / 2);
let best_ones = -1;
let cx = 0, cy = 0;

for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        let ones = 0;
        for (let dy = 0; dy < block_size; dy++) {
            for (let dx = 0; dx < block_size; dx++) {
                let ty = (y + dy) % H;
                let tx = (x + dx) % W;
                if (target_grid[ty * W + tx] === 1) ones++;
            }
        }
        if (ones > best_ones) {
            best_ones = ones;
            cx = (x + half_block) % W;
            cy = (y + half_block) % H;
        }
    }
}

let order = [];
for (let i = 0; i < W * H; i++) order.push(i);

order.sort((a, b) => {
    let ax = a % W, ay = Math.floor(a / W);
    let bx = b % W, by = Math.floor(b / W);
    
    let dax = Math.min(Math.abs(ax - cx), W - Math.abs(ax - cx));
    let day = Math.min(Math.abs(ay - cy), H - Math.abs(ay - cy));
    let dbx = Math.min(Math.abs(bx - cx), W - Math.abs(bx - cx));
    let dby = Math.min(Math.abs(by - cy), H - Math.abs(by - cy));
    
    let da = Math.max(dax, day);
    let db = Math.max(dbx, dby);
    
    if (da !== db) return da - db;
    return (dax * dax + day * day) - (dbx * dbx + dby * dby);
});

const MAX_UNDO = 5000000;
const G = new Uint8Array((N + 1) * W * H);
G.fill(2);
const undo_stack = new Uint32Array(MAX_UNDO);
let undo_ptr = 0;

function update_forward(vx, vy, new_val) {
    let g0_idx = vy * W + vx;
    undo_stack[undo_ptr++] = (g0_idx << 8) | G[g0_idx];
    G[g0_idx] = new_val;
    
    for (let k = 1; k <= N; k++) {
        let min_dy = -k, max_dy = k;
        let min_dx = -k, max_dx = k;
        let offset_in = (k - 1) * W * H;
        let offset_out = k * W * H;
        let changed_in_k = false;
        
        for (let dy = min_dy; dy <= max_dy; dy++) {
            let y = (vy + dy + H * N) % H;
            let ym1 = (y - 1 + H) % H, yp1 = (y + 1 + H) % H;
            let r_ym1 = offset_in + ym1 * W;
            let r_y   = offset_in + y * W;
            let r_yp1 = offset_in + yp1 * W;
            
            for (let dx = min_dx; dx <= max_dx; dx++) {
                let x = (vx + dx + W * N) % W;
                let xm1 = (x - 1 + W) % W, xp1 = (x + 1 + W) % W;
                
                let ones = 0, unks = 0;
                let n1 = G[r_ym1 + xm1]; if (n1===1) ones++; else if (n1===2) unks++;
                let n2 = G[r_ym1 + x];   if (n2===1) ones++; else if (n2===2) unks++;
                let n3 = G[r_ym1 + xp1]; if (n3===1) ones++; else if (n3===2) unks++;
                let n4 = G[r_y + xm1];   if (n4===1) ones++; else if (n4===2) unks++;
                let n5 = G[r_y + xp1];   if (n5===1) ones++; else if (n5===2) unks++;
                let n6 = G[r_yp1 + xm1]; if (n6===1) ones++; else if (n6===2) unks++;
                let n7 = G[r_yp1 + x];   if (n7===1) ones++; else if (n7===2) unks++;
                let n8 = G[r_yp1 + xp1]; if (n8===1) ones++; else if (n8===2) unks++;
                
                let idx = y * W + x;
                let c_val = G[r_y + x];
                let next_val = NEXT_LUT[(c_val << 8) | (ones << 4) | unks];
                
                if (next_val === 3) return false;
                
                if (k === N) {
                    let t_val = target_grid[idx];
                    if (t_val !== 2 && next_val !== 2 && t_val !== next_val) return false;
                }
                
                let abs_idx = offset_out + idx;
                if (G[abs_idx] !== next_val) {
                    undo_stack[undo_ptr++] = (abs_idx << 8) | G[abs_idx];
                    G[abs_idx] = next_val;
                    changed_in_k = true;
                }
            }
        }
        if (!changed_in_k) break;
    }
    return true;
}

function evolve_full(gin, gout) {
    for (let y = 0; y < H; y++) {
        let ym1 = (y - 1 + H) % H, yp1 = (y + 1 + H) % H;
        for (let x = 0; x < W; x++) {
            let xm1 = (x - 1 + W) % W, xp1 = (x + 1 + W) % W;
            let ones = 0;
            if (gin[ym1 * W + xm1] === 1) ones++;
            if (gin[ym1 * W + x] === 1) ones++;
            if (gin[ym1 * W + xp1] === 1) ones++;
            if (gin[y * W + xm1] === 1) ones++;
            if (gin[y * W + xp1] === 1) ones++;
            if (gin[yp1 * W + xm1] === 1) ones++;
            if (gin[yp1 * W + x] === 1) ones++;
            if (gin[yp1 * W + xp1] === 1) ones++;
            
            let c_val = gin[y * W + x];
            gout[y * W + x] = (c_val === 1 && (ones === 2 || ones === 3)) || (c_val === 0 && ones === 3) ? 1 : 0;
        }
    }
}

let depth = 0;
let max_depth = W * H;
let frame_ptrs = new Uint32Array(max_depth + 1);
frame_ptrs[0] = 0;

let best_hamming = 999999;
let best_g0 = new Uint8Array(W * H);

let start_time = Date.now();
let nodes = 0;
let branches_pruned = 0;
let first_check_depth = -1;
let exhausted = false;

let tried = new Uint8Array(max_depth);

while (depth >= 0 && depth < max_depth) {
    if ((nodes & 1023) === 0) {
        if (Date.now() - start_time > 29500) break;
    }
    
    let g0_idx = order[depth];
    let vx = g0_idx % W;
    let vy = Math.floor(g0_idx / W);
    
    if (tried[depth] === 0 || tried[depth] === 1) {
        let val_to_try = tried[depth] === 0 ? 0 : 1;
        tried[depth] = tried[depth] + 1;
        nodes++;
        
        if (update_forward(vx, vy, val_to_try)) {
            depth++;
            if (depth === max_depth) {
                best_hamming = 0;
                best_g0.set(G.subarray(0, W * H));
                break;
            }
            tried[depth] = 0;
            frame_ptrs[depth] = undo_ptr;
            if (depth > first_check_depth) {
                first_check_depth = depth;
                for (let i = 0; i < W * H; i++) best_g0[i] = G[i] === 2 ? 0 : G[i];
            }
        } else {
            branches_pruned++;
            while (undo_ptr > frame_ptrs[depth]) {
                let v = undo_stack[--undo_ptr];
                G[v >> 8] = v & 0xFF;
            }
        }
    } else {
        tried[depth] = 0;
        depth--;
        if (depth >= 0) {
            while (undo_ptr > frame_ptrs[depth]) {
                let v = undo_stack[--undo_ptr];
                G[v >> 8] = v & 0xFF;
            }
        }
    }
}

let status = "FOUND";
if (depth === max_depth) {
    status = "FOUND";
} else if (depth < 0) {
    status = "EXHAUSTED";
} else {
    status = "TIMEOUT";
}

if (status !== "FOUND") {
    let t_in = new Uint8Array(W * H);
    let t_out = new Uint8Array(W * H);
    t_in.set(best_g0);
    for (let k = 0; k < N; k++) {
        evolve_full(t_in, t_out);
        t_in.set(t_out);
    }
    let h = 0;
    for (let i = 0; i < W * H; i++) {
        if (t_in[i] !== target_grid[i]) h++;
    }
    best_hamming = h;
}

let out_str = "";
for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
        row += best_g0[y * W + x];
    }
    out_str += row + "\n";
}
fs.writeFileSync("results/gen0_v4.txt", out_str.trim());

let elapsed = (Date.now() - start_time) / 1000;
console.log(`STATUS: ${status}`);
console.log(`Nodes evaluated: ${nodes}`);
console.log(`Branches pruned: ${branches_pruned}`);
console.log(`Max depth reached: ${first_check_depth} / ${max_depth}`);
console.log(`Nodes/sec: ${(nodes / elapsed).toFixed(2)}`);
console.log(`Best Hamming distance: ${best_hamming}`);
