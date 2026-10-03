use crate::engine::{identity, no_symlinks, now};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, Read},
    path::Path,
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Fingerprint {
    pub device: u64,
    pub inode: u64,
    pub size: u64,
    pub modified: u128,
    #[serde(default)]
    pub changed: u128,
}
impl Fingerprint {
    pub fn read(path: &Path) -> Result<Self, String> {
        no_symlinks(path)?;
        let m = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        Ok(Self::from_metadata(&m))
    }
    pub fn from_metadata(m: &fs::Metadata) -> Self {
        use std::os::unix::fs::MetadataExt;
        let (device, inode) = identity(m);
        Self {
            device,
            inode,
            size: m.len(),
            modified: m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_nanos())
                .unwrap_or(0),
            changed: m.ctime().max(0) as u128 * 1_000_000_000 + m.ctime_nsec().max(0) as u128,
        }
    }
    pub fn validate(&self, path: &Path) -> Result<(), String> {
        let mut current = Self::read(path)?;
        if self.changed == 0 {
            current.changed = 0;
        } // Upgrade pre-0.4 identities during background reconciliation.
        if current != *self {
            Err(format!(
                "Item alterado; revise a seleção atualizada: {}",
                path.display()
            ))
        } else {
            Ok(())
        }
    }
}
pub fn fresh(created: u64) -> Result<(), String> {
    if now().saturating_sub(created) > 1800 {
        Err("Análise expirada. Analise novamente.".into())
    } else {
        Ok(())
    }
}
pub fn run(
    binary: &Path,
    args: &[String],
    cancel: &AtomicBool,
    seconds: u64,
) -> Result<Vec<u8>, String> {
    run_with_lines(binary, args, cancel, seconds, |_| {})
}
pub fn run_with_lines(
    binary: &Path,
    args: &[String],
    cancel: &AtomicBool,
    seconds: u64,
    on_line: impl Fn(&str) + Send + 'static,
) -> Result<Vec<u8>, String> {
    let mut command = Command::new(binary);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let mut stdout = child.stdout.take().ok_or("Saída indisponível")?;
    let stderr = child.stderr.take().ok_or("Erro indisponível")?;
    let out = std::thread::spawn(move || {
        let mut b = Vec::new();
        stdout.read_to_end(&mut b).map(|_| b)
    });
    let err = std::thread::spawn(move || {
        let mut b = Vec::new();
        for line in std::io::BufReader::new(stderr).lines() {
            let line = line?;
            on_line(&line);
            if b.len() < 1800 {
                if !b.is_empty() {
                    b.push(b'\n');
                }
                b.extend(line.bytes().take(1800 - b.len()));
            }
        }
        Ok::<_, std::io::Error>(b)
    });
    let start = Instant::now();
    let mut interrupted = None;
    let status = loop {
        if cancel.load(Ordering::Relaxed) || start.elapsed() > Duration::from_secs(seconds) {
            interrupted = Some(if cancel.load(Ordering::Relaxed) {
                "Operação interrompida"
            } else {
                "A operação excedeu o tempo limite"
            });
            #[cfg(unix)]
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGKILL);
            }
            let _ = child.kill();
            break child.wait().map_err(|e| e.to_string())?;
        }
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        std::thread::sleep(Duration::from_millis(40));
    };
    let output = out
        .join()
        .map_err(|_| "Falha ao ler saída")?
        .map_err(|e| e.to_string())?;
    let error = err
        .join()
        .map_err(|_| "Falha ao ler erro")?
        .map_err(|e| e.to_string())?;
    if let Some(e) = interrupted {
        return Err(e.into());
    }
    if !status.success() {
        return Err(String::from_utf8_lossy(&error).chars().take(1800).collect());
    }
    Ok(output)
}
pub fn command(binary: &str, args: &[&str], cancel: &AtomicBool) -> Result<Vec<u8>, String> {
    run(
        Path::new(binary),
        &args.iter().map(|v| v.to_string()).collect::<Vec<_>>(),
        cancel,
        30,
    )
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    pub id: String,
    pub original: String,
    pub trashed: String,
    pub restored: bool,
    pub fingerprint: Option<Fingerprint>,
}
pub fn trash_path(path: &Path) -> Result<Recovery, String> {
    no_symlinks(path)?;
    #[cfg(target_os = "macos")]
    {
        use objc2_foundation::{NSFileManager, NSString, NSURL};
        let original = path
            .to_str()
            .ok_or("Caminho não UTF-8; preservado")?
            .to_string();
        let url = NSURL::fileURLWithPath(&NSString::from_str(&original));
        let mut resulting = None;
        NSFileManager::defaultManager()
            .trashItemAtURL_resultingItemURL_error(&url, Some(&mut resulting))
            .map_err(|e| format!("Não foi possível enviar à Lixeira: {e}"))?;
        let trashed = resulting
            .and_then(|u| u.path())
            .map(|s| s.to_string())
            .unwrap_or_default();
        // Movement has already succeeded. Lack of trash access must not be reported as a failed move.
        let fingerprint = if trashed.is_empty() {
            None
        } else {
            Fingerprint::read(Path::new(&trashed)).ok()
        };
        Ok(Recovery {
            id: crate::engine::stamp(),
            original,
            trashed,
            restored: false,
            fingerprint,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Lixeira nativa disponível no macOS".into())
    }
}
pub fn restore(item: &mut Recovery) -> Result<(), String> {
    if item.restored {
        return Err("Este item já foi recuperado".into());
    }
    let from = Path::new(&item.trashed);
    let to = Path::new(&item.original);
    if to.exists() {
        return Err("Já existe um item no caminho original. Ele foi preservado.".into());
    }
    no_symlinks(to.parent().ok_or("Pasta original inválida")?)?;
    item.fingerprint
        .as_ref()
        .ok_or("Recuperação automática indisponível. Abra a Lixeira pelo Finder.")?
        .validate(from)?;
    rename_exclusive(from, to)?;
    item.restored = true;
    Ok(())
}
fn rename_exclusive(from: &Path, to: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        let src = CString::new(from.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
        let dst = CString::new(to.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
        if unsafe {
            libc::renameatx_np(
                libc::AT_FDCWD,
                src.as_ptr(),
                libc::AT_FDCWD,
                dst.as_ptr(),
                libc::RENAME_EXCL,
            )
        } != 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (from, to);
        Err("Restauração disponível no macOS".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restoration_never_overwrites_existing_destination() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        let from = d.path().join("trashed");
        let to = d.path().join("original");
        fs::write(&from, "recover me").unwrap();
        fs::write(&to, "keep me").unwrap();
        assert!(rename_exclusive(&from, &to).is_err());
        assert_eq!(fs::read_to_string(&to).unwrap(), "keep me");
        assert!(from.exists());
    }
    #[test]
    fn restoration_checks_identity_and_parent() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        let from = d.path().join("trashed");
        fs::write(&from, "recover me").unwrap();
        let to = d.path().join("original");
        let mut r = Recovery {
            id: "test".into(),
            original: to.to_string_lossy().into(),
            trashed: from.to_string_lossy().into(),
            restored: false,
            fingerprint: Some(Fingerprint::read(&from).unwrap()),
        };
        restore(&mut r).unwrap();
        assert_eq!(fs::read_to_string(to).unwrap(), "recover me");
        assert!(r.restored);
        assert!(restore(&mut r).is_err());
    }
    #[test]
    fn run_with_lines_separates_stderr_lines_with_newline() {
        let cancel = AtomicBool::new(false);
        let binary = Path::new("/bin/sh");
        let args = vec![
            "-c".to_string(),
            "printf 'error line 1\nerror line 2\n' >&2; exit 1".to_string(),
        ];
        let err = run_with_lines(binary, &args, &cancel, 5, |_| {}).unwrap_err();
        assert!(err.contains("error line 1\nerror line 2"), "got: {:?}", err);
    }
}

#[cfg(all(test, target_os = "macos"))]
mod trash_integration_tests {
    use super::*;
    #[test]
    fn native_trash_round_trip_for_disposable_fixture() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        let p = d
            .path()
            .join(format!("folga-test-{}.txt", crate::engine::stamp()));
        fs::write(&p, "Disposable Folga native trash fixture").unwrap();
        let mut item = trash_path(&p).unwrap();
        assert!(!p.exists());
        assert!(item.fingerprint.is_some(),"Native trash moved the fixture, but access for automatic restoration is unavailable: {}",item.trashed);
        restore(&mut item).unwrap();
        assert_eq!(
            fs::read_to_string(p).unwrap(),
            "Disposable Folga native trash fixture"
        );
    }
}
pub fn measure_isolated(path: &Path, cancel: &AtomicBool) -> Result<(u64, u64, u64), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let path = path.to_str().ok_or("Caminho não UTF-8")?.to_string();
    let bytes = run(&exe, &["--folga-worker-measure".into(), path], cancel, 30)?;
    serde_json::from_slice::<Result<(u64, u64, u64), String>>(&bytes).map_err(|e| e.to_string())?
}

pub fn names_isolated(path: &Path, cancel: &AtomicBool) -> Result<Vec<String>, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let path = path.to_str().ok_or("Caminho não UTF-8")?.to_string();
    let bytes = run(&exe, &["--folga-worker-names".into(), path], cancel, 20)?;
    serde_json::from_slice::<Result<Vec<String>, String>>(&bytes).map_err(|e| e.to_string())?
}
#[cfg(test)]
mod process_tests {
    use super::*;
    #[test]
    fn cancellation_terminates_native_worker() {
        let start = Instant::now();
        let result = run(
            Path::new("/bin/sleep"),
            &["30".into()],
            &AtomicBool::new(true),
            60,
        );
        assert!(result.is_err());
        assert!(start.elapsed() < Duration::from_secs(2));
    }
}
