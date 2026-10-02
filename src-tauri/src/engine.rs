use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use walkdir::WalkDir;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub total: u64,
    pub free: u64,
    pub used: u64,
    pub volume: String,
    pub home: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: String,
    pub path: String,
    pub label: String,
    pub category: String,
    pub bytes: u64,
    pub files: u64,
    pub risk: String,
    pub blocked: Option<String>,
    #[serde(skip)]
    pub device: u64,
    #[serde(skip)]
    pub inode: u64,
    #[serde(skip)]
    pub modified: u64,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub id: String,
    pub candidates: Vec<Candidate>,
    pub warnings: Vec<String>,
    pub scanned_dirs: u64,
    pub elapsed_ms: u64,
    pub roots: Vec<String>,
    pub created_at: u64,
}
#[derive(Serialize, Deserialize)]
pub struct SavedScan {
    report: ScanReport,
    identities: HashMap<String, (u64, u64, u64)>,
}
impl SavedScan {
    pub fn from_report(report: ScanReport) -> Self {
        let identities = report
            .candidates
            .iter()
            .map(|c| (c.id.clone(), (c.device, c.inode, c.modified)))
            .collect();
        Self { report, identities }
    }
    pub fn into_report(mut self) -> ScanReport {
        for c in &mut self.report.candidates {
            if let Some((device, inode, modified)) = self.identities.get(&c.id) {
                (c.device, c.inode, c.modified) = (*device, *inode, *modified);
            } else {
                c.blocked = Some("Identificação ausente; atualize este cache".into());
            }
        }
        self.report
    }
}
pub fn retain_candidates(report: &mut ScanReport, removed: &[String]) {
    report.candidates.retain(|c| {
        !removed
            .iter()
            .any(|p| Path::new(&c.path).starts_with(p) || Path::new(p).starts_with(&c.path))
            && match fs::symlink_metadata(&c.path) {
                Ok(m) => !m.file_type().is_symlink(),
                Err(e) => e.kind() != std::io::ErrorKind::NotFound,
            }
    });
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub visited: u64,
    pub path: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRecord {
    pub id: String,
    pub created_at: u64,
    pub removed_bytes: u64,
    #[serde(default)]
    pub moved_bytes: u64,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub recovery: Vec<crate::native::Recovery>,
    pub freed_bytes: u64,
    pub removed: Vec<String>,
    pub skipped: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub incomplete: bool,
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_string()
}
pub fn disk_info() -> Result<DiskInfo, String> {
    let home = dirs::home_dir().ok_or("Pasta pessoal não encontrada")?;
    #[cfg(unix)]
    {
        use std::ffi::CString;
        use std::mem::MaybeUninit;
        let volume = if cfg!(target_os = "macos") {
            "/System/Volumes/Data"
        } else {
            "/"
        };
        let path = CString::new(volume).unwrap();
        let mut stat = MaybeUninit::<libc::statvfs>::uninit();
        if unsafe { libc::statvfs(path.as_ptr(), stat.as_mut_ptr()) } != 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let stat = unsafe { stat.assume_init() };
        let block = stat.f_frsize as u64;
        let total = (stat.f_blocks as u64) * block;
        let free = (stat.f_bavail as u64) * block;
        let used = total.saturating_sub((stat.f_bfree as u64) * block);
        Ok(DiskInfo {
            total,
            free,
            used,
            volume: volume.into(),
            home: home.to_string_lossy().into(),
        })
    }
    #[cfg(not(unix))]
    {
        Err("Esta versão foi preparada para macOS e Linux.".into())
    }
}
pub(crate) fn identity(meta: &fs::Metadata) -> (u64, u64) {
    #[cfg(unix)]
    {
        (meta.dev(), meta.ino())
    }
    #[cfg(not(unix))]
    {
        (0, meta.len())
    }
}
pub(crate) fn allocated(meta: &fs::Metadata) -> u64 {
    #[cfg(unix)]
    {
        meta.blocks() * 512
    }
    #[cfg(not(unix))]
    {
        meta.len()
    }
}
pub(crate) fn no_symlinks(path: &Path) -> Result<(), String> {
    for part in path.ancestors() {
        if fs::symlink_metadata(part)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err(format!("Link simbólico preservado: {}", part.display()));
        }
    }
    Ok(())
}
pub(crate) fn measure(path: &Path, cancel: &AtomicBool) -> Result<(u64, u64, u64), String> {
    let mut size = 0;
    let mut count = 0;
    let mut modified = 0;
    let mut seen = HashSet::new();
    for entry in WalkDir::new(path).follow_links(false) {
        if cancel.load(Ordering::Relaxed) {
            return Err("Análise cancelada".into());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_symlink() {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        modified = modified.max(
            meta.modified()
                .ok()
                .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_nanos().min(u64::MAX as u128) as u64)
                .unwrap_or(0),
        );
        if meta.is_file() && seen.insert(identity(&meta)) {
            size += allocated(&meta);
            count += 1;
        }
    }
    Ok((size, count, modified))
}
fn git_output(path: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let result = Command::new("/usr/bin/git")
        .arg("-C")
        .arg(path)
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .map_err(|e| format!("Git indisponível: {e}"))?;
    if !result.status.success() {
        return Err("Git não conseguiu validar este diretório".into());
    }
    Ok(result.stdout)
}
fn git_guard(path: &Path) -> Result<(), String> {
    let parent = path.parent().ok_or("Diretório inválido")?;
    let repo = String::from_utf8(git_output(parent, &["rev-parse", "--show-toplevel"])?)
        .map_err(|e| e.to_string())?;
    let repo = repo.trim();
    let rel = path
        .strip_prefix(repo)
        .map_err(|_| "Diretório fora do projeto")?
        .to_string_lossy();
    let ignore = Command::new("/usr/bin/git")
        .arg("-C")
        .arg(repo)
        .args(["check-ignore", "-q", "--", &format!("{rel}/")])
        .env("GIT_OPTIONAL_LOCKS", "0")
        .status()
        .map_err(|e| e.to_string())?;
    if !ignore.success() {
        return Err("Pasta não ignorada pelo Git; preservada".into());
    }
    if !git_output(Path::new(repo), &["ls-files", "-z", "--", &rel])?.is_empty() {
        return Err("Contém arquivos rastreados pelo Git; preservada".into());
    }
    Ok(())
}
pub fn build_kind(path: &Path) -> Option<&'static str> {
    if path.file_name()?.to_str()? == "debug" {
        let parent = path.parent()?;
        let target = if parent.file_name()? == "target" {
            parent
        } else {
            parent.parent()?
        };
        if target.file_name()? == "target" && target.parent()?.join("Cargo.toml").is_file() {
            return Some("rust");
        }
    }
    if path.file_name()?.to_str()? == "cache" {
        let parent = path.parent()?;
        let next = if parent.file_name()? == ".next" {
            parent
        } else if parent.file_name()? == "dev" {
            parent.parent()?
        } else {
            return None;
        };
        if next.file_name()? == ".next" && next.parent()?.join("package.json").is_file() {
            return Some("next");
        }
    }
    None
}
fn dependency_kind(path: &Path) -> Option<&'static str> {
    if path.file_name()? == "node_modules" && path.parent()?.join("package.json").is_file() {
        Some("node_modules")
    } else {
        None
    }
}
fn fixed_caches(home: &Path) -> Vec<(PathBuf, &'static str, &'static str)> {
    vec![
        (home.join(".npm/_cacache"), "npm", "Cache de pacotes npm"),
        (home.join(".cache/uv"), "python", "Cache Python · uv"),
        (
            home.join("Library/Caches/pip"),
            "python",
            "Cache Python · pip",
        ),
        (
            home.join("Library/Caches/Homebrew"),
            "packages",
            "Downloads Homebrew",
        ),
        (
            home.join("Library/Developer/Xcode/DerivedData"),
            "xcode",
            "Compilações Xcode",
        ),
    ]
}
fn docker_disk(home: &Path) -> PathBuf {
    home.join("Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw")
}
fn protected_kind(path: &Path, home: &Path) -> Option<String> {
    if let Some(kind) = build_kind(path).or_else(|| dependency_kind(path)) {
        return Some(kind.into());
    }
    for (fixed, kind, _) in fixed_caches(home) {
        if path == fixed {
            return Some(kind.into());
        }
    }
    if path == docker_disk(home) {
        return Some("docker".into());
    }
    None
}
fn active_processes() -> Result<(bool, bool, bool), String> {
    let result = Command::new("/bin/ps")
        .args(["-axo", "comm=,args="])
        .output()
        .map_err(|e| format!("Não foi possível conferir processos: {e}"))?;
    if !result.status.success() {
        return Err("Não foi possível conferir processos ativos".into());
    }
    let list = String::from_utf8_lossy(&result.stdout);
    let builds = list.lines().any(|line| {
        let command = line.split_whitespace().next().unwrap_or("");
        let name = Path::new(command)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        matches!(
            name.as_ref(),
            "cargo" | "rustc" | "xcodebuild" | "next-server"
        ) || line.contains("/next/dist/bin/next")
    });
    let docker = list.lines().any(|line| {
        line.contains("com.docker.backend")
            || line.contains("/OrbStack.app/")
            || line.contains("qemu-system")
    });
    let installs = list.lines().any(|line| {
        line.contains("pnpm install")
            || line.contains("npm install")
            || line.contains("pip install")
            || line.contains("uv sync")
    });
    Ok((builds, docker, installs))
}
fn candidate(
    path: PathBuf,
    kind: &str,
    label: &str,
    cancel: &AtomicBool,
    id: usize,
) -> Result<Candidate, String> {
    no_symlinks(&path)?;
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    let (bytes, files, modified) = measure(&path, cancel)?;
    let (device, inode) = identity(&meta);
    let blocked = if matches!(kind, "rust" | "next" | "node_modules") {
        git_guard(&path).err()
    } else {
        None
    };
    Ok(Candidate {
        id: id.to_string(),
        path: path.to_string_lossy().into(),
        label: label.into(),
        category: kind.into(),
        bytes,
        files,
        risk: if kind == "docker" { "data" } else { "cache" }.into(),
        blocked,
        device,
        inode,
        modified,
    })
}
pub fn default_roots() -> Vec<String> {
    let home = dirs::home_dir().unwrap_or_default();
    [
        home.join("www"),
        home.join(".codex/worktrees"),
        PathBuf::from("/private/tmp"),
    ]
    .into_iter()
    .filter(|p| p.is_dir())
    .map(|p| p.to_string_lossy().into())
    .collect()
}
pub fn scan(
    roots: Vec<String>,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
) -> Result<ScanReport, String> {
    let start = Instant::now();
    let home = dirs::home_dir().ok_or("Pasta pessoal não encontrada")?;
    let mut paths = Vec::new();
    let mut warnings = Vec::new();
    let mut seen = HashSet::new();
    let mut visited = 0;
    let mut last_progress = Instant::now();
    let mut valid_roots = Vec::new();
    for root in roots {
        let path = PathBuf::from(&root);
        no_symlinks(&path)?;
        let path = fs::canonicalize(&path).map_err(|e| e.to_string())?;
        if !path.is_dir() {
            return Err("Escolha uma pasta para analisar".into());
        }
        if path == Path::new("/") || path == Path::new("/System") || path == Path::new("/Library") {
            return Err("Escolha uma pasta de projetos ou sua pasta pessoal".into());
        }
        if valid_roots.iter().any(|r: &String| path.starts_with(r)) {
            continue;
        }
        valid_roots.push(path.to_string_lossy().to_string());
    }
    for root in &valid_roots {
        let mut walker = WalkDir::new(root).follow_links(false).into_iter();
        while let Some(entry) = walker.next() {
            if cancel.load(Ordering::Relaxed) {
                return Err("Análise cancelada".into());
            }
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    if warnings.len() < 30 {
                        warnings.push(e.to_string());
                    }
                    continue;
                }
            };
            if !entry.file_type().is_dir() {
                continue;
            }
            visited += 1;
            if last_progress.elapsed() > Duration::from_millis(180) {
                progress(Progress {
                    visited,
                    path: entry.path().to_string_lossy().into(),
                });
                last_progress = Instant::now();
            }
            let name = entry.file_name().to_string_lossy();
            if name == "node_modules" {
                if dependency_kind(entry.path()).is_some()
                    && seen.insert(entry.path().to_path_buf())
                {
                    progress(Progress {
                        visited,
                        path: entry.path().to_string_lossy().into(),
                    });
                    match candidate(
                        entry.path().to_path_buf(),
                        "node_modules",
                        "Dependências node_modules",
                        cancel,
                        paths.len(),
                    ) {
                        Ok(c) => paths.push(c),
                        Err(e) => {
                            if warnings.len() < 30 {
                                warnings.push(e);
                            }
                        }
                    }
                }
                walker.skip_current_dir();
                continue;
            }
            if matches!(
                name.as_ref(),
                ".git" | ".godot" | ".venv" | ".vision-venv" | "dist" | "build"
            ) {
                walker.skip_current_dir();
                continue;
            }
            if name == "target" && entry.path().parent().unwrap().join("Cargo.toml").is_file() {
                let target = entry.path();
                let mut builds = vec![target.join("debug")];
                if let Ok(children) = fs::read_dir(target) {
                    for child in children.flatten() {
                        if child.file_name() != "debug" && child.file_name() != "release" {
                            builds.push(child.path().join("debug"));
                        }
                    }
                }
                for build in builds {
                    if build.is_dir() && seen.insert(build.clone()) {
                        progress(Progress {
                            visited,
                            path: build.to_string_lossy().into(),
                        });
                        match candidate(
                            build,
                            "rust",
                            "Build Rust de desenvolvimento",
                            cancel,
                            paths.len(),
                        ) {
                            Ok(c) => {
                                if c.bytes > 1024 * 1024 {
                                    paths.push(c)
                                }
                            }
                            Err(e) => {
                                if warnings.len() < 30 {
                                    warnings.push(e)
                                }
                            }
                        }
                    }
                }
                walker.skip_current_dir();
            } else if name == ".next"
                && entry
                    .path()
                    .parent()
                    .unwrap()
                    .join("package.json")
                    .is_file()
            {
                for cache in [entry.path().join("cache"), entry.path().join("dev/cache")] {
                    if cache.is_dir() && seen.insert(cache.clone()) {
                        progress(Progress {
                            visited,
                            path: cache.to_string_lossy().into(),
                        });
                        match candidate(cache, "next", "Cache Next.js", cancel, paths.len()) {
                            Ok(c) => {
                                if c.bytes > 1024 * 1024 {
                                    paths.push(c)
                                }
                            }
                            Err(e) => {
                                if warnings.len() < 30 {
                                    warnings.push(e)
                                }
                            }
                        }
                    }
                }
                walker.skip_current_dir();
            }
        }
    }
    for (path, kind, label) in fixed_caches(&home) {
        if path.is_dir() && seen.insert(path.clone()) {
            progress(Progress {
                visited,
                path: path.to_string_lossy().into(),
            });
            match candidate(path, kind, label, cancel, paths.len()) {
                Ok(c) => {
                    if c.bytes > 1024 * 1024 {
                        paths.push(c)
                    }
                }
                Err(e) => {
                    if warnings.len() < 30 {
                        warnings.push(e)
                    }
                }
            }
        }
    }
    let docker = docker_disk(&home);
    if docker.is_file() {
        let mut c = candidate(
            docker,
            "docker",
            "Disco Docker · todos os dados",
            cancel,
            paths.len(),
        )?;
        match active_processes() {
            Ok((_, true, _)) => c.blocked = Some("Docker ou OrbStack em execução".into()),
            Err(e) => c.blocked = Some(e),
            _ => {}
        }
        if c.bytes > 1024 * 1024 {
            paths.push(c);
        }
    }
    paths.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    Ok(ScanReport {
        id: stamp(),
        candidates: paths,
        warnings,
        scanned_dirs: visited,
        elapsed_ms: start.elapsed().as_millis() as u64,
        roots: valid_roots,
        created_at: now(),
    })
}
pub fn validate_cleanup(
    c: &Candidate,
    home: &Path,
    cancel: &AtomicBool,
    docker_confirmation: &str,
) -> Result<(), String> {
    let path = PathBuf::from(&c.path);
    no_symlinks(&path)?;
    let kind = protected_kind(&path, home).ok_or("Este tipo de pasta não pode ser removido")?;
    if kind != c.category {
        return Err("A pasta mudou desde a análise. Analise novamente.".into());
    }
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if identity(&meta) != (c.device, c.inode) {
        return Err("A pasta foi substituída. Analise novamente.".into());
    }
    let (bytes, files, modified) = measure(&path, cancel)?;
    if (bytes, files, modified) != (c.bytes, c.files, c.modified) {
        return Err("Arquivos mudaram desde a análise. Analise novamente.".into());
    }
    if matches!(kind.as_str(), "rust" | "next" | "node_modules") {
        git_guard(&path)?;
    }
    if kind == "docker" && docker_confirmation != "APAGAR DOCKER" {
        return Err("Digite APAGAR DOCKER para remover imagens, containers e volumes.".into());
    }
    if let Some(reason) = &c.blocked {
        return Err(reason.clone());
    }
    Ok(())
}
pub fn cleanup(
    report: &ScanReport,
    ids: Vec<String>,
    confirmation: String,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
) -> Result<CleanupRecord, String> {
    let home = dirs::home_dir().ok_or("Pasta pessoal não encontrada")?;
    cleanup_at_home(report, ids, confirmation, cancel, progress, &home, true)
}
fn cleanup_at_home(
    report: &ScanReport,
    ids: Vec<String>,
    confirmation: String,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
    home: &Path,
    check_processes: bool,
) -> Result<CleanupRecord, String> {
    if ids.is_empty() {
        return Err("Selecione pelo menos um item".into());
    }
    let items: HashMap<_, _> = report
        .candidates
        .iter()
        .map(|c| (c.id.clone(), c))
        .collect();
    let mut selected = Vec::new();
    let mut unique = HashSet::new();
    for id in ids {
        if unique.insert(id.clone()) {
            selected.push(*items.get(&id).ok_or("Item não pertence à última análise")?);
        }
    }
    let mut record = CleanupRecord {
        id: stamp(),
        created_at: now(),
        removed_bytes: 0,
        moved_bytes: 0,
        mode: "permanent".into(),
        recovery: vec![],
        freed_bytes: 0,
        removed: vec![],
        skipped: vec![],
    };
    let free_before = disk_info().map(|d| d.free).unwrap_or(0);
    for (i, c) in selected.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            record
                .skipped
                .push("Operação interrompida entre itens".into());
            break;
        }
        let attempt = (|| {
            if check_processes {
                let (builds, docker, installs) = active_processes()?;
                if (c.category == "rust"
                    || c.category == "next"
                    || c.category == "xcode"
                    || c.category == "node_modules")
                    && builds
                {
                    return Err(
                        "Processo de desenvolvimento ativo; feche o build e analise novamente"
                            .into(),
                    );
                }
                if matches!(
                    c.category.as_str(),
                    "npm" | "python" | "packages" | "node_modules"
                ) && installs
                {
                    return Err("Instalação de dependências em andamento; cache preservado".into());
                }
                if c.category == "docker" && docker {
                    return Err("Feche Docker e OrbStack antes de remover o disco".into());
                }
            }
            validate_cleanup(c, home, cancel, &confirmation)?;
            progress(Progress {
                visited: i as u64 + 1,
                path: c.path.clone(),
            });
            let path = Path::new(&c.path);
            no_symlinks(path)?;
            if c.category == "docker" {
                fs::remove_file(path)
            } else {
                fs::remove_dir_all(path)
            }
            .map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        })();
        match attempt {
            Ok(()) => {
                record.removed_bytes += c.bytes;
                record.removed.push(c.path.clone());
            }
            Err(e) => record.skipped.push(format!("{}: {e}", c.path)),
        }
    }
    record.freed_bytes = disk_info()
        .map(|d| d.free.saturating_sub(free_before))
        .unwrap_or(0);
    Ok(record)
}
pub fn folder_map(
    root: String,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
) -> Result<Vec<FolderInfo>, String> {
    let root = PathBuf::from(root);
    no_symlinks(&root)?;
    let mut result = vec![];
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if cancel.load(Ordering::Relaxed) {
            return Err("Análise cancelada".into());
        }
        let path = entry.path();
        if entry.file_type().map_err(|e| e.to_string())?.is_symlink() {
            continue;
        }
        progress(Progress {
            visited: result.len() as u64,
            path: path.to_string_lossy().into(),
        });
        let measured = measure(&path, cancel);
        if cancel.load(Ordering::Relaxed) {
            return Err("Análise cancelada".into());
        }
        let incomplete = measured.is_err();
        let bytes = measured.map(|m| m.0).unwrap_or(0);
        result.push(FolderInfo {
            path: path.to_string_lossy().into(),
            name: entry.file_name().to_string_lossy().into(),
            bytes,
            incomplete,
        });
    }
    result.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    fn repo() -> TempDir {
        let dir = tempfile::tempdir_in("/private/tmp").unwrap();
        Command::new("/usr/bin/git")
            .arg("init")
            .arg("-q")
            .arg(dir.path())
            .status()
            .unwrap();
        fs::write(dir.path().join("Cargo.toml"), "[workspace]").unwrap();
        fs::write(dir.path().join(".gitignore"), "target/\n.next/\n").unwrap();
        dir
    }
    fn make_candidate(r: &TempDir) -> Candidate {
        let path = r.path().join("target/debug");
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("generated"), vec![8; 8192]).unwrap();
        candidate(path, "rust", "Rust", &AtomicBool::new(false), 0).unwrap()
    }
    fn report(c: Candidate) -> ScanReport {
        ScanReport {
            id: "test".into(),
            candidates: vec![c],
            warnings: vec![],
            scanned_dirs: 0,
            elapsed_ms: 0,
            roots: vec![],
            created_at: now(),
        }
    }
    #[test]
    fn node_modules_requires_project_and_git_safety() {
        let r = repo();
        let path = r.path().join("node_modules");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("package.js"), "generated").unwrap();
        assert!(dependency_kind(&path).is_none());
        fs::write(r.path().join("package.json"), "{}").unwrap();
        assert_eq!(dependency_kind(&path), Some("node_modules"));
        let blocked = candidate(
            path.clone(),
            "node_modules",
            "Dependencies",
            &AtomicBool::new(false),
            0,
        )
        .unwrap();
        assert!(blocked.blocked.is_some());
        fs::write(r.path().join(".gitignore"), "node_modules/\n").unwrap();
        let c = candidate(
            path,
            "node_modules",
            "Dependencies",
            &AtomicBool::new(false),
            0,
        )
        .unwrap();
        assert!(c.blocked.is_none());
        assert!(validate_cleanup(&c, r.path(), &AtomicBool::new(false), "").is_ok());
        Command::new("/usr/bin/git")
            .arg("-C")
            .arg(r.path())
            .args(["add", "-f", "node_modules/package.js"])
            .status()
            .unwrap();
        assert!(validate_cleanup(&c, r.path(), &AtomicBool::new(false), "").is_err());
    }
    #[test]
    fn source_and_release_never_classified() {
        let r = repo();
        assert!(build_kind(&r.path().join("src")).is_none());
        assert!(build_kind(&r.path().join("target/release")).is_none());
    }
    #[test]
    fn rejects_non_ignored_directory() {
        let r = repo();
        let c = make_candidate(&r);
        fs::write(r.path().join(".gitignore"), "").unwrap();
        assert!(validate_cleanup(&c, r.path(), &AtomicBool::new(false), "").is_err());
    }
    #[test]
    fn rejects_tracked_file_inside_ignored_directory() {
        let r = repo();
        let c = make_candidate(&r);
        Command::new("/usr/bin/git")
            .arg("-C")
            .arg(r.path())
            .args(["add", "-f", "target/debug/generated"])
            .status()
            .unwrap();
        assert!(validate_cleanup(&c, r.path(), &AtomicBool::new(false), "").is_err());
    }
    #[test]
    fn rejects_changed_plan() {
        let r = repo();
        let c = make_candidate(&r);
        fs::write(Path::new(&c.path).join("new-source"), "keep").unwrap();
        assert!(validate_cleanup(&c, r.path(), &AtomicBool::new(false), "").is_err());
    }
    #[test]
    fn deletes_only_selected_generated_path() {
        let r = repo();
        let c = make_candidate(&r);
        fs::write(r.path().join("source.rs"), "keep").unwrap();
        fs::create_dir_all(r.path().join("target/release")).unwrap();
        fs::write(r.path().join("target/release/proof"), "keep").unwrap();
        let cleaned = cleanup_at_home(
            &report(c.clone()),
            vec![c.id],
            "".into(),
            &AtomicBool::new(false),
            |_| {},
            r.path(),
            false,
        )
        .unwrap();
        assert_eq!(cleaned.removed.len(), 1);
        assert!(r.path().join("source.rs").is_file());
        assert!(r.path().join("target/release/proof").is_file());
    }
    #[test]
    fn rejects_forged_id() {
        let r = repo();
        assert!(cleanup_at_home(
            &report(make_candidate(&r)),
            vec!["forged".into()],
            "".into(),
            &AtomicBool::new(false),
            |_| {},
            r.path(),
            false
        )
        .is_err());
    }
    #[test]
    fn cancellation_never_deletes() {
        let r = repo();
        let c = make_candidate(&r);
        cleanup_at_home(
            &report(c.clone()),
            vec![c.id.clone()],
            "".into(),
            &AtomicBool::new(true),
            |_| {},
            r.path(),
            false,
        )
        .unwrap();
        assert!(Path::new(&c.path).exists());
    }
    #[test]
    fn docker_requires_explicit_phrase() {
        let r = repo();
        let path = docker_disk(r.path());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, vec![0; 8192]).unwrap();
        let c = candidate(path, "docker", "Docker", &AtomicBool::new(false), 0).unwrap();
        assert!(validate_cleanup(&c, r.path(), &AtomicBool::new(false), "").is_err());
        assert!(validate_cleanup(&c, r.path(), &AtomicBool::new(false), "APAGAR DOCKER").is_ok());
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_escape_cleanup() {
        let r = repo();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir_all(r.path().join("target")).unwrap();
        std::os::unix::fs::symlink(outside.path(), r.path().join("target/debug")).unwrap();
        assert!(candidate(
            r.path().join("target/debug"),
            "rust",
            "Rust",
            &AtomicBool::new(false),
            0
        )
        .is_err());
    }
    #[test]
    fn old_persisted_cache_revalidates_selected_path_without_requiring_full_scan() {
        let r = repo();
        fs::create_dir(r.path().join("src")).unwrap();
        fs::write(r.path().join("src/lib.rs"), "pub fn keep() {}\n").unwrap();
        let mut report = report(make_candidate(&r));
        report.created_at = 0;
        let saved = serde_json::to_vec(&SavedScan::from_report(report)).unwrap();
        let reopened = serde_json::from_slice::<SavedScan>(&saved)
            .unwrap()
            .into_report();
        let record = cleanup_at_home(
            &reopened,
            vec!["0".into()],
            "".into(),
            &AtomicBool::new(false),
            |_| {},
            r.path(),
            false,
        )
        .unwrap();
        assert_eq!(record.removed.len(), 1);
        assert!(record.skipped.is_empty());
        assert!(!r.path().join("target/debug").exists());
        assert!(r.path().join("src/lib.rs").exists());
    }
    #[test]
    fn cleanup_record_prunes_only_affected_cached_candidates() {
        let first = repo();
        let second = repo();
        let mut report = report(make_candidate(&first));
        let mut other = make_candidate(&second);
        other.id = "other".into();
        report.candidates.push(other.clone());
        retain_candidates(
            &mut report,
            &[first.path().join("target/debug").to_string_lossy().into()],
        );
        assert_eq!(report.candidates.len(), 1);
        assert_eq!(report.candidates[0].id, other.id);
    }
}

impl CleanupRecord {
    pub fn new(mode: &str) -> Self {
        Self {
            id: stamp(),
            created_at: now(),
            removed_bytes: 0,
            moved_bytes: 0,
            mode: mode.into(),
            recovery: vec![],
            freed_bytes: 0,
            removed: vec![],
            skipped: vec![],
        }
    }
}
