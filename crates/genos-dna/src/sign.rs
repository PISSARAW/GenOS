use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey, Verifier};

pub const SECRET_KEY_LEN: usize = 32;
pub const PUBLIC_KEY_LEN: usize = 32;
pub const SIGNATURE_LEN: usize = 64;

pub fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn hex_decode(text: &str) -> Result<Vec<u8>, String> {
    let trimmed = text.trim();
    if trimmed.len() % 2 != 0 {
        return Err("hex input must have an even length".to_string());
    }
    let mut out = Vec::with_capacity(trimmed.len() / 2);
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        let high = hex_value(bytes[index])?;
        let low = hex_value(bytes[index + 1])?;
        out.push((high << 4) | low);
        index += 2;
    }
    Ok(out)
}

fn hex_value(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(format!("invalid hex character '{}'", byte as char)),
    }
}

fn fixed_32(bytes: &[u8], label: &str) -> Result<[u8; 32], String> {
    bytes.try_into().map_err(|_| format!("{label} must be exactly 32 bytes"))
}

pub fn signing_key_from_secret(secret: &[u8]) -> Result<SigningKey, String> {
    Ok(SigningKey::from_bytes(&fixed_32(secret, "secret key")?))
}

pub fn generate_signing_key() -> SigningKey {
    let mut bytes = [0u8; SECRET_KEY_LEN];
    bytes[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    SigningKey::from_bytes(&bytes)
}

pub fn secret_key_hex(signing: &SigningKey) -> String {
    hex_encode(&signing.to_bytes())
}

pub fn public_key_hex(signing: &SigningKey) -> String {
    hex_encode(signing.verifying_key().as_bytes())
}

pub fn sign_flux(signing: &SigningKey, flux: &[u8]) -> Vec<u8> {
    signing.sign(flux).to_bytes().to_vec()
}

pub fn verify_flux(public_key_hex: &str, flux: &[u8], signature: &[u8]) -> Result<(), String> {
    let key_bytes = hex_decode(public_key_hex)?;
    let verifying = VerifyingKey::from_bytes(&fixed_32(&key_bytes, "public key")?);
    let verifying = verifying.map_err(|error| format!("invalid ed25519 public key: {error}"))?;
    if signature.len() != SIGNATURE_LEN {
        return Err(format!("signature must be {SIGNATURE_LEN} bytes"));
    }
    let parsed = Signature::from_slice(signature).map_err(|error| format!("invalid signature: {error}"))?;
    verifying
        .verify(flux, &parsed)
        .map_err(|_| "AgentDNA signature verification failed".to_string())
}
