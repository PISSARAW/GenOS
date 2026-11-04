#![cfg(feature="native-llm")]
#[path="helpers/agentic_ledger_fixture.rs"] mod fixture;
use std::net::{TcpListener,TcpStream};
use std::time::{Duration,Instant};

#[test]
fn fixture_accepts_dispatch_after_five_seconds_inside_its_declared_window() {
    let listener=TcpListener::bind("127.0.0.1:0").unwrap();
    let address=listener.local_addr().unwrap();
    let client=std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(6));
        TcpStream::connect(address).unwrap()
    });
    let started=Instant::now();
    let stream=fixture::accept_for(&listener,Duration::from_secs(20)).unwrap();
    assert!(started.elapsed()>=Duration::from_secs(6));
    assert_eq!(stream.peer_addr().unwrap(),client.join().unwrap().local_addr().unwrap());
}

#[test]
fn fixture_refuses_a_connection_when_the_declared_window_is_already_closed() {
    let listener=TcpListener::bind("127.0.0.1:0").unwrap();
    let _client=TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    let error=fixture::accept_for(&listener,Duration::ZERO).unwrap_err();
    assert_eq!(error,"fixture expected HTTP dispatch");
}
