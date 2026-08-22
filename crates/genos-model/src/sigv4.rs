use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug)]
pub struct AwsCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SigV4Headers {
    pub authorization: String,
    pub amz_date: String,
    pub security_token: Option<String>,
}

pub fn sign_bedrock_converse(
    credentials: &AwsCredentials,
    region: &str,
    model_id: &str,
    payload: &[u8],
    now: DateTime<Utc>,
) -> SigV4Headers {
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date = now.format("%Y%m%d").to_string();
    let host = format!("bedrock-runtime.{region}.amazonaws.com");
    let path = format!("/model/{model_id}/converse");
    let payload_hash = hex(&Sha256::digest(payload));
    let mut headers =
        format!("content-type:application/json\nhost:{host}\nx-amz-date:{amz_date}\n");
    let mut signed = "content-type;host;x-amz-date".to_string();
    if let Some(token) = &credentials.session_token {
        headers.push_str(&format!("x-amz-security-token:{token}\n"));
        signed.push_str(";x-amz-security-token");
    }
    let canonical = format!("POST\n{path}\n\n{headers}\n{signed}\n{payload_hash}");
    let scope = format!("{date}/{region}/bedrock/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        hex(&Sha256::digest(canonical.as_bytes()))
    );
    let k_date = hmac(
        format!("AWS4{}", credentials.secret_access_key).as_bytes(),
        &date,
    );
    let k_region = hmac(&k_date, region);
    let k_service = hmac(&k_region, "bedrock");
    let k_signing = hmac(&k_service, "aws4_request");
    let signature = hex(&hmac(&k_signing, &string_to_sign));
    SigV4Headers {
        authorization: format!(
            "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed}, Signature={signature}",
            credentials.access_key_id
        ),
        amz_date,
        security_token: credentials.session_token.clone(),
    }
}
fn hmac(key: &[u8], data: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts arbitrary keys");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}
fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signature_has_aws_authorization_shape() {
        let credentials = AwsCredentials {
            access_key_id: "AKID".into(),
            secret_access_key: "secret".into(),
            session_token: None,
        };
        let signed = sign_bedrock_converse(
            &credentials,
            "us-east-1",
            "model",
            b"{}",
            "2026-01-01T00:00:00Z".parse().unwrap(),
        );
        assert!(signed
            .authorization
            .contains("Credential=AKID/20260101/us-east-1/bedrock/aws4_request"));
    }
}
