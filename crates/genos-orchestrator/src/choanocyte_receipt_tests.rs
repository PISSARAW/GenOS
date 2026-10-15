use super::*;
use ed25519_dalek::{Signer, SigningKey};

    fn test_path() -> std::path::PathBuf {
        let directory = std::env::current_dir().unwrap().join("target");
        std::fs::create_dir_all(&directory).unwrap();
        directory.join(format!("genos-choano-{}.jsonl", uuid::Uuid::new_v4()))
    }

    fn test_trust(key: &SigningKey, producer_id: uuid::Uuid) -> ChoanocyteProducerAuthority {
        let document = json!({
            "schema": "genos.choanocyte-producer-trust/v1",
            "producers": [{
                "producer_id": producer_id,
                "public_key_hex": hex(&key.verifying_key().to_bytes()),
            }]
        });
        ChoanocyteProducerAuthority::from_bootstrap_json(&document.to_string()).unwrap()
    }

    struct TestProducer<'a> {
        mission_id: uuid::Uuid,
        producer_id: uuid::Uuid,
        key: &'a SigningKey,
    }

    fn signed_stream(
        packets: Vec<RawSignalPacket>,
        producer: &TestProducer<'_>,
    ) -> MissionChoanocyteStream {
        let mut stream = MissionChoanocyteStream::new(packets);
        stream.producer_id = producer.producer_id;
        stream.signature_hex = hex(&producer.key.sign(
            &stream.signing_bytes(producer.mission_id).unwrap(),
        ).to_bytes());
        stream
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn persisted_receipt_binds_actual_stream_to_mission_and_survives_reopen() {
        let path = test_path();
        let packets = vec![
            RawSignalPacket { id: "retained-1".into(), size_nm: 150.0, semantic_density: 0.9, content: "signal-a".into(), is_noise: false },
            RawSignalPacket { id: "noise-1".into(), size_nm: 40.0, semantic_density: 0.1, content: "signal-b".into(), is_noise: true },
            RawSignalPacket { id: "retained-2".into(), size_nm: 180.0, semantic_density: 0.7, content: "signal-c".into(), is_noise: false },
        ];
        let mission_id = uuid::Uuid::new_v4();
        let producer_id = uuid::Uuid::new_v4();
        let key = SigningKey::from_bytes(&[9; 32]);
        let authority = test_trust(&key, producer_id);
        let producer = TestProducer { mission_id, producer_id, key: &key };
        let stream = signed_stream(packets.clone(), &producer);
        let (receipt, orchestrator_id) = {
            let store = BiologicalReceiptStore::open(&path);
            let mut ecosystem = GenosEcosystem::new("choanocyte-mission");
            ecosystem.set_mission_id(mission_id);
            let receipt = ecosystem.filter_stream_and_persist(&stream, &store, &authority).unwrap();
            (receipt, ecosystem.orchestrator.orchestrator_id)
        };

        let reopened = BiologicalReceiptStore::open(&path);
        let recovered = reopened.read_all().unwrap();
        let stored = recovered.iter().find(|item| item["receiptId"] == receipt["receiptId"]).unwrap();
        assert_eq!(stored["schema"], RECEIPT_SCHEMA);
        assert_eq!(stored["missionId"], mission_id.to_string());
        assert_eq!(stored["orchestratorId"], orchestrator_id.to_string());
        assert_eq!(stored["producerId"], producer_id.to_string());
        assert_eq!(stored["runtimeProducerId"], orchestrator_id.to_string());
        assert_eq!(stored["producerTrustKeySha256"].as_str().unwrap().len(), 64);
        assert_eq!(stored["cellId"], "orchestrator_choanocyte");
        assert_eq!(stored["streamSchema"], STREAM_SCHEMA);
        assert_eq!(stored["inputSha256"], digest_stream(&stream).unwrap());
        assert_eq!(stored["packetCount"], 3);
        assert_eq!(stored["retainedCount"], 2);
        assert_eq!(stored["rejectedCount"], 1);
        assert!(stored["measuredElapsedNs"].as_u64().unwrap() > 0);
        assert!(stored["measuredPacketsPerSecondMilli"].as_u64().unwrap() > 0);
        assert_eq!(stored["modeledFlowMilliUnits"]["pumpingRateMlS"], 450);
        assert_eq!(stored["hydrodynamicMeasurement"], false);
        assert_eq!(recovered.len(), 1);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn same_stream_in_another_mission_gets_a_distinct_receipt() {
        let path = test_path();
        let store = BiologicalReceiptStore::open(&path);
        let packets = vec![RawSignalPacket {
            id: "signal".into(),
            size_nm: 150.0,
            semantic_density: 0.9,
            content: "shared input".into(),
            is_noise: false,
        }];
        let producer_id = uuid::Uuid::new_v4();
        let key = SigningKey::from_bytes(&[7; 32]);
        let authority = test_trust(&key, producer_id);
        let mut first = GenosEcosystem::new("first-mission");
        let mission_a = uuid::Uuid::new_v4();
        first.set_mission_id(mission_a);
        let first_producer = TestProducer { mission_id: mission_a, producer_id, key: &key };
        let stream_a = signed_stream(packets.clone(), &first_producer);
        let first_receipt = first.filter_stream_and_persist(&stream_a, &store, &authority).unwrap();
        let mut second = GenosEcosystem::new("second-mission");
        let mission_b = uuid::Uuid::new_v4();
        second.set_mission_id(mission_b);
        let second_producer = TestProducer { mission_id: mission_b, producer_id, key: &key };
        let stream_b = signed_stream(packets, &second_producer);
        let second_receipt = second.filter_stream_and_persist(&stream_b, &store, &authority).unwrap();

        assert_ne!(first_receipt["missionId"], second_receipt["missionId"]);
        assert_ne!(first_receipt["idempotency_key"], second_receipt["idempotency_key"]);
        assert_eq!(store.read_all().unwrap().len(), 2);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stream_receipt_refuses_unbound_mission() {
        let path = test_path();
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("unbound-choanocyte");
        let stream = MissionChoanocyteStream::new(vec![]);
        let authority = test_trust(&SigningKey::from_bytes(&[1; 32]), uuid::Uuid::new_v4());
        assert!(ecosystem.filter_stream_and_persist(&stream, &store, &authority).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stream_rejects_missing_or_duplicate_packet_identity_before_filtering() {
        let path = test_path();
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("invalid-choanocyte");
        ecosystem.set_mission_id(uuid::Uuid::new_v4());
        let duplicate = RawSignalPacket { id: "same".into(), size_nm: 120.0, semantic_density: 0.5, content: "x".into(), is_noise: false };
        let producer_id = uuid::Uuid::new_v4();
        let key = SigningKey::from_bytes(&[2; 32]);
        let authority = test_trust(&key, producer_id);
        let producer = TestProducer { mission_id: ecosystem.mission_id.unwrap(), producer_id, key: &key };
        let stream = signed_stream(vec![duplicate.clone(), duplicate], &producer);
        assert!(ecosystem.filter_stream_and_persist(&stream, &store, &authority).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stream_rejects_unknown_external_producer_even_with_a_signature() {
        let producer_id = uuid::Uuid::new_v4();
        let key = SigningKey::from_bytes(&[3; 32]);
        let mission_id = uuid::Uuid::new_v4();
        let producer = TestProducer { mission_id, producer_id, key: &key };
        let stream = signed_stream(vec![], &producer);
        let authority = test_trust(&SigningKey::from_bytes(&[4; 32]), uuid::Uuid::new_v4());
        let mut ecosystem = GenosEcosystem::new("unknown-choanocyte-producer");
        ecosystem.set_mission_id(mission_id);
        let path = test_path();
        let store = BiologicalReceiptStore::open(&path);
        assert!(ecosystem.filter_stream_and_persist(&stream, &store, &authority).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stream_signature_is_bound_to_mission_and_payload() {
        let producer_id = uuid::Uuid::new_v4();
        let key = SigningKey::from_bytes(&[5; 32]);
        let mission_id = uuid::Uuid::new_v4();
        let authority = test_trust(&key, producer_id);
        let producer = TestProducer { mission_id, producer_id, key: &key };
        let stream = signed_stream(vec![], &producer);
        let other_mission = uuid::Uuid::new_v4();
        let mut ecosystem = GenosEcosystem::new("tampered-choanocyte");
        ecosystem.set_mission_id(other_mission);
        let path = test_path();
        let store = BiologicalReceiptStore::open(&path);
        assert!(ecosystem.filter_stream_and_persist(&stream, &store, &authority).is_err());
        assert!(store.read_all().unwrap().is_empty());
        ecosystem.set_mission_id(mission_id);
        let mut altered = stream.clone();
        altered.packets.push(RawSignalPacket { id: "injected".into(), size_nm: 150.0, semantic_density: 0.8, content: "tampered".into(), is_noise: false });
        assert!(ecosystem.filter_stream_and_persist(&altered, &store, &authority).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn malformed_bootstrap_trust_fails_closed() {
        let forged = serde_json::json!({
            "schema": "genos.choanocyte-producer-trust/v0",
            "producers": []
        });
        assert!(ChoanocyteProducerAuthority::from_bootstrap_json(&forged.to_string()).is_err());
    }

    #[test]
    fn stream_receipt_fails_closed_when_runtime_producer_is_not_active() {
        let path = test_path();
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("inactive-producer");
        ecosystem.set_mission_id(uuid::Uuid::new_v4());
        ecosystem.orchestrator.orchestrator_id = uuid::Uuid::new_v4();
        let mission_id = ecosystem.mission_id.unwrap();
        let producer_id = uuid::Uuid::new_v4();
        let key = SigningKey::from_bytes(&[6; 32]);
        let authority = test_trust(&key, producer_id);
        let producer = TestProducer { mission_id, producer_id, key: &key };
        let stream = signed_stream(vec![], &producer);
        assert!(ecosystem.filter_stream_and_persist(&stream, &store, &authority).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }
