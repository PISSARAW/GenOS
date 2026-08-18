use anyhow::bail;

use super::types::{CompressionMetrics, CompressionStrategy, ScientificProtocol};

pub struct Encoded {
    pub size: usize,
    pub decoded: Vec<u8>,
}

pub fn benchmark(
    strategy: &CompressionStrategy,
    records: &[String],
    protocol: &ScientificProtocol,
) -> anyhow::Result<CompressionMetrics> {
    let all = records
        .iter()
        .chain(&protocol.holdout_records)
        .collect::<Vec<_>>();
    let mut input_bytes = 0;
    let mut compressed_bytes = 0;
    let mut valid = true;
    for _ in 0..protocol.repetitions {
        for record in &all {
            let input = record.as_bytes();
            let encoded = compress(strategy, input)?;
            input_bytes += input.len();
            compressed_bytes += encoded.size;
            valid &= encoded.decoded == input;
        }
    }
    let compression_ratio = if input_bytes == 0 {
        1.0
    } else {
        compressed_bytes as f64 / input_bytes as f64
    };
    Ok(CompressionMetrics {
        input_bytes,
        compressed_bytes,
        compression_ratio,
        round_trip_valid: valid,
        repetitions: protocol.repetitions,
    })
}

pub fn compress(strategy: &CompressionStrategy, input: &[u8]) -> anyhow::Result<Encoded> {
    match strategy {
        CompressionStrategy::Raw => Ok(Encoded {
            size: input.len(),
            decoded: input.to_vec(),
        }),
        CompressionStrategy::RunLength => rle(input),
        CompressionStrategy::DeltaRunLength => delta_rle(input),
        CompressionStrategy::ChunkDedup { chunk_size } => chunk_dedup(input, *chunk_size),
        CompressionStrategy::Adaptive => adaptive(input),
    }
}

fn delta_rle(input: &[u8]) -> anyhow::Result<Encoded> {
    let mut previous = 0_u8;
    let deltas = input
        .iter()
        .map(|byte| {
            let delta = byte.wrapping_sub(previous);
            previous = *byte;
            delta
        })
        .collect::<Vec<_>>();
    let encoded = rle(&deltas)?;
    let mut previous = 0_u8;
    let decoded = encoded
        .decoded
        .iter()
        .map(|delta| {
            let byte = previous.wrapping_add(*delta);
            previous = byte;
            byte
        })
        .collect();
    Ok(Encoded {
        size: encoded.size + 1,
        decoded,
    })
}

fn chunk_dedup(input: &[u8], chunk_size: usize) -> anyhow::Result<Encoded> {
    if chunk_size == 0 {
        bail!("chunk_size must be positive");
    }
    let mut dictionary: Vec<Vec<u8>> = Vec::new();
    let mut indexes = Vec::new();
    for chunk in input.chunks(chunk_size) {
        let index = dictionary
            .iter()
            .position(|known| known == chunk)
            .unwrap_or_else(|| {
                dictionary.push(chunk.to_vec());
                dictionary.len() - 1
            });
        indexes.push(index);
    }
    let decoded = indexes
        .iter()
        .flat_map(|index| dictionary[*index].clone())
        .collect();
    let dictionary_bytes = dictionary
        .iter()
        .map(|chunk| chunk.len() + 1)
        .sum::<usize>();
    Ok(Encoded {
        size: dictionary_bytes + indexes.len() * 2 + 2,
        decoded,
    })
}

fn adaptive(input: &[u8]) -> anyhow::Result<Encoded> {
    let candidates = [
        compress(&CompressionStrategy::Raw, input)?,
        rle(input)?,
        compress(&CompressionStrategy::DeltaRunLength, input)?,
    ];
    let mut best = candidates
        .into_iter()
        .min_by_key(|candidate| candidate.size)
        .unwrap();
    best.size += 1;
    Ok(best)
}

pub fn rle(input: &[u8]) -> anyhow::Result<Encoded> {
    if input.is_empty() {
        return Ok(Encoded {
            size: 0,
            decoded: Vec::new(),
        });
    }
    let mut pairs = Vec::new();
    let mut current = input[0];
    let mut count = 1_u8;
    for byte in &input[1..] {
        if *byte == current && count < u8::MAX {
            count += 1;
        } else {
            pairs.push((count, current));
            current = *byte;
            count = 1;
        }
    }
    pairs.push((count, current));
    let decoded = pairs
        .iter()
        .flat_map(|(count, byte)| std::iter::repeat_n(*byte, *count as usize))
        .collect();
    Ok(Encoded {
        size: pairs.len() * 2,
        decoded,
    })
}
