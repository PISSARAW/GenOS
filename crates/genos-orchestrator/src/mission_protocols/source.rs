use super::{RunSpec, integer, raw_hash};
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

pub struct Source {
    pub bytes: Vec<u8>,
    pub input: Vec<i64>,
    pub hash: String,
    _handle: File,
}

pub struct Blob {
    pub bytes: Vec<u8>,
    pub hash: String,
    _handle: File,
}

pub fn read(spec: &RunSpec) -> Result<Source, String> {
    let blob = read_blob(&spec.workspace, &spec.input_path)?;
    let input: Vec<i64> = serde_json::from_slice(&blob.bytes).map_err(|e| format!("invalid integer source: {e}"))?;
    integer::validate(&input)?;
    Ok(Source { hash: blob.hash, bytes: blob.bytes, input, _handle:blob._handle })
}

pub fn read_blob(workspace: &Path, relative: &str) -> Result<Blob, String> {
    let root = workspace.canonicalize().map_err(|e| e.to_string())?;
    let path = confined_input(&root, relative)?;
    let file = open_source(&path)?;
    let bytes = read_bytes(&file)?;
    if confined_input(&root, relative)? != path { return Err("source path changed".into()); }
    Ok(Blob { hash: raw_hash(&bytes), bytes, _handle:file })
}

fn open_source(path: &Path) -> Result<File,String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1);
    }
    let file = options.open(&path).map_err(|e| e.to_string())?;
    single_link(&file)?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() { return Err("source must be a regular file".into()); }
    Ok(file)
}

fn read_bytes(file: &File) -> Result<Vec<u8>, String> {
    let mut bytes=Vec::new();
    file.take(65537).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len()>65536 { return Err("native input exceeds 64 KiB".into()); }
    Ok(bytes)
}

fn confined_input(root: &Path, relative: &str) -> Result<PathBuf,String> {
    if relative.contains(['\\', ':', '\0']) || relative.len()>1024 || relative.is_empty() {
        return Err("native input path is not confined".into());
    }
    let mut path=root.to_path_buf();
    for part in Path::new(relative).components() {
        let Component::Normal(name)=part else { return Err("native input path traversal refused".into()); };
        if name.to_string_lossy().eq_ignore_ascii_case(".genos-native") { return Err("runtime journal is not mission input".into()); }
        path.push(name);
        no_link(&path)?;
    }
    let actual=path.canonicalize().map_err(|e| e.to_string())?;
    if !actual.starts_with(root) { return Err("native source escaped workspace".into()); }
    private_source(root,&actual)?;
    Ok(actual)
}

fn private_source(root:&Path,actual:&Path) -> Result<(),String> {
    let relative=actual.strip_prefix(root).map_err(|e| e.to_string())?;
    if relative.components().any(|part|part.as_os_str().to_string_lossy().eq_ignore_ascii_case(".genos-native")) {
        return Err("runtime journal is not mission input".into());
    }
    Ok(())
}

fn no_link(path: &Path) -> Result<(),String> {
    let metadata=std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() { return Err("native source symlink refused".into()); }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 { return Err("native source reparse point refused".into()); }
    }
    Ok(())
}

pub fn journal_path(workspace: &Path) -> Result<PathBuf,String> {
    let root=workspace.canonicalize().map_err(|e| e.to_string())?;
    let directory=root.join(".genos-native");
    journal_directory(&directory)?;
    let path=directory.join("mission-protocols.sqlite");
    journal_file(&path)?;
    for suffix in ["-wal","-shm","-journal"] {
        journal_file(&directory.join(format!("mission-protocols.sqlite{suffix}")))?;
    }
    Ok(path)
}

fn journal_directory(directory: &Path) -> Result<(),String> {
    if !directory.exists() {
        match std::fs::create_dir(&directory) {
            Ok(())=>{}, Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>{},
            Err(e)=>return Err(e.to_string()),
        }
    }
    no_link(&directory)?;
    if directory.canonicalize().map_err(|e| e.to_string())? != directory { return Err("native journal root changed".into()); }
    Ok(())
}

fn journal_file(path: &Path) -> Result<(),String> {
    match std::fs::symlink_metadata(&path) {
        Ok(metadata) => {
            no_link(&path)?;
            if !metadata.is_file() { return Err("native journal must be a regular file".into()); }
            single_link(&File::open(&path).map_err(|e| e.to_string())?)?;
        }
        Err(error) if error.kind()==std::io::ErrorKind::NotFound => {},
        Err(error) => return Err(error.to_string()),
    }
    Ok(())
}

#[cfg(unix)]
fn single_link(file: &File) -> Result<(),String> {
    use std::os::unix::fs::MetadataExt;
    if file.metadata().map_err(|e| e.to_string())?.nlink()!=1 { return Err("native hardlink refused".into()); }
    Ok(())
}

#[cfg(windows)]
fn single_link(file: &File) -> Result<(),String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{BY_HANDLE_FILE_INFORMATION,GetFileInformationByHandle};
    let mut information:BY_HANDLE_FILE_INFORMATION=unsafe { std::mem::zeroed() };
    let valid=unsafe { GetFileInformationByHandle(file.as_raw_handle(),&mut information) };
    if valid==0 { return Err(std::io::Error::last_os_error().to_string()); }
    if information.nNumberOfLinks!=1 { return Err("native hardlink refused".into()); }
    Ok(())
}
