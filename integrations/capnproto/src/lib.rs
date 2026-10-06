use capnp::{message, serialize, serialize_packed};
use std::time::Instant;

pub fn capnp_roundtrip(payload: &[u8], packed: bool) -> Result<Vec<u8>, capnp::Error> {
    if payload.len() > 1_000_000 {
        return Err(capnp::Error::failed("payload too large".into()));
    }
    let mut builder = message::Builder::new_default();
    builder.initn_root::<capnp::data::Builder>(payload.len() as u32).copy_from_slice(payload);
    let mut bytes = Vec::new();
    if packed {
        serialize_packed::write_message(&mut bytes, &builder)?;
    } else {
        serialize::write_message(&mut bytes, &builder)?;
    }
    let options = message::ReaderOptions {
        traversal_limit_in_words: Some(131_072),
        nesting_limit: 8,
    };
    let reader = if packed {
        serialize_packed::read_message(bytes.as_slice(), options)?
    } else {
        serialize::read_message(bytes.as_slice(), options)?
    };
    Ok(reader.get_root::<capnp::data::Reader>()?.to_vec())
}

pub fn compare(payload: &[u8], repetitions: u32) -> Result<String, capnp::Error> {
    if repetitions == 0 || repetitions > 10_000 {
        return Err(capnp::Error::failed("invalid repetitions".into()));
    }
    let start = Instant::now();
    for _ in 0..repetitions {
        assert_eq!(capnp_roundtrip(payload, true)?, payload);
    }
    let capnp_time = start.elapsed().as_nanos();
    let start = Instant::now();
    for _ in 0..repetitions {
        let bytes = rmp_serde::to_vec(&payload).map_err(|e| capnp::Error::failed(e.to_string()))?;
        let decoded: Vec<u8> = rmp_serde::from_slice(&bytes).map_err(|e| capnp::Error::failed(e.to_string()))?;
        assert_eq!(decoded, payload);
    }
    let msgpack_time = start.elapsed().as_nanos();
    Ok(format!("capnp_packed_ns={capnp_time} msgpack_ns={msgpack_time}"))
}

#[cfg(test)]
mod tests {
    use super::{capnp_roundtrip, compare};

    #[test]
    fn packed_and_plain_roundtrip() {
        let payload = b"mission state without a promotion claim";
        assert_eq!(capnp_roundtrip(payload, false).unwrap(), payload);
        assert_eq!(capnp_roundtrip(payload, true).unwrap(), payload);
        assert!(compare(payload, 10).unwrap().contains("msgpack_ns="));
    }
}
