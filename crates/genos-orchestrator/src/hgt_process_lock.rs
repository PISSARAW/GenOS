use std::fs::{File, OpenOptions};
use std::io;
use std::path::Path;

/// Kernel-owned exclusive lock; the OS releases it when a process exits.
pub struct ProcessFileLock {
    _file: File,
}

impl ProcessFileLock {
    pub fn acquire(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        create_lock_parent(path)?;
        let file = open_lock_file(path).map_err(|error| error.to_string())?;
        lock_file(&file).map_err(|error| format!("process file lock failed: {error}"))?;
        Ok(Self { _file: file })
    }
}

fn create_lock_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent().filter(|value| !value.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn open_lock_file(path: &Path) -> io::Result<File> {
    OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)
}

#[cfg(unix)]
fn lock_file(file: &File) -> io::Result<()> {
    use std::os::fd::AsRawFd;
    loop {
        let result = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX) };
        if result == 0 {
            return Ok(());
        }
        let error = io::Error::last_os_error();
        if error.kind() != io::ErrorKind::Interrupted {
            return Err(error);
        }
    }
}

#[cfg(windows)]
fn lock_file(file: &File) -> io::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{LockFileEx, LOCKFILE_EXCLUSIVE_LOCK};
    use windows_sys::Win32::System::IO::OVERLAPPED;

    let mut overlapped = OVERLAPPED::default();
    let locked = unsafe {
        LockFileEx(
            file.as_raw_handle(),
            LOCKFILE_EXCLUSIVE_LOCK,
            0,
            1,
            0,
            &mut overlapped,
        )
    };
    if locked == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(any(unix, windows)))]
fn lock_file(_file: &File) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "HGT process locking is unsupported on this platform",
    ))
}

#[cfg(test)]
mod tests {
    use super::ProcessFileLock;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::thread;
    use std::time::{Duration, Instant};

    #[test]
    fn existing_sidecar_file_can_be_locked_again_after_release() {
        let path = test_lock_path();
        let first = ProcessFileLock::acquire(&path).unwrap();
        drop(first);
        assert!(path.exists(), "kernel lock sidecar remains reusable");
        let second = ProcessFileLock::acquire(&path).unwrap();
        drop(second);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn process_exit_releases_the_kernel_lock() {
        if std::env::var_os("GENOS_HGT_LOCK_CHILD_PATH").is_some() {
            hold_lock_for_parent();
            return;
        }
        let path = test_lock_path();
        let ready = path.with_extension("ready");
        let mut child = spawn_lock_holder(&path, &ready);
        if !wait_for_ready(&ready) {
            let _ = child.kill();
            let _ = child.wait();
            panic!("child did not acquire the HGT process lock");
        }
        let waiter_path = path.clone();
        let (send, receive) = mpsc::channel();
        let waiter = thread::spawn(move || {
            let acquired = ProcessFileLock::acquire(&waiter_path).unwrap();
            send.send(acquired).unwrap();
        });
        assert!(receive.recv_timeout(Duration::from_millis(100)).is_err());
        child.kill().unwrap();
        child.wait().unwrap();

        let recovered = receive.recv_timeout(Duration::from_secs(2)).unwrap();
        waiter.join().unwrap();
        std::fs::remove_file(ready).unwrap();
        drop(recovered);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn lock_holder_child_process() {
        if std::env::var_os("GENOS_HGT_LOCK_CHILD_PATH").is_some() {
            hold_lock_for_parent();
        }
    }

    fn test_lock_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("genos-hgt-lock-{}.lock", uuid::Uuid::new_v4()))
    }

    fn spawn_lock_holder(path: &std::path::Path, ready: &std::path::Path) -> std::process::Child {
        Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "process_file_lock::tests::lock_holder_child_process"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .env("GENOS_HGT_LOCK_CHILD_PATH", path)
            .env("GENOS_HGT_LOCK_CHILD_READY", ready)
            .spawn()
            .unwrap()
    }

    fn hold_lock_for_parent() {
        let path = std::env::var_os("GENOS_HGT_LOCK_CHILD_PATH").unwrap();
        let ready = std::env::var_os("GENOS_HGT_LOCK_CHILD_READY").unwrap();
        let _lock = ProcessFileLock::acquire(std::path::Path::new(&path)).unwrap();
        std::fs::write(std::path::Path::new(&ready), b"locked").unwrap();
        loop {
            thread::sleep(Duration::from_secs(1));
        }
    }

    fn wait_for_ready(path: &std::path::Path) -> bool {
        let deadline = Instant::now() + Duration::from_secs(15);
        while !path.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        path.exists()
    }
}
