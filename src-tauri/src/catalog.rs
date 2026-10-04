use crate::{activity::Detail, policy::Protection};
use crate::{
    engine::{allocated, now, stamp, CleanupRecord, Progress},
    native::{trash_path, Fingerprint},
};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::UNIX_EPOCH,
};
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: String,
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub logical_bytes: u64,
    pub modified: u64,
    pub accessed: Option<u64>,
    pub kind: String,
    pub blocked: Option<String>,
    #[serde(skip)]
    pub fingerprint: Option<Fingerprint>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub directory: bool,
    pub incomplete: bool,
}
#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub path: String,
    pub name: String,
    pub ecosystem: String,
    pub bytes: u64,
    pub build_bytes: u64,
    pub dependency_bytes: u64,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CatalogReport {
    pub id: String,
    pub root: String,
    pub created_at: u64,
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub updated_at: u64,
    #[serde(default)]
    pub verified_at: u64,
    #[serde(default)]
    pub duplicates_checked: bool,
    pub bytes: u64,
    pub files: Vec<FileEntry>,
    pub projects: Vec<Project>,
    pub warnings: Vec<String>,
    pub visited: u64,
    pub incomplete: bool,
    #[serde(default)]
    pub cached: bool,
    #[serde(default)]
    pub scanned_directories: u64,
    #[serde(default)]
    pub reused_directories: u64,
    #[serde(default)]
    pub elapsed_ms: u64,
    #[serde(default)]
    pub unreadable: Vec<Unreadable>,
    #[serde(skip)]
    pub inventory: HashMap<String, DirectoryInventory>,
    #[serde(skip)]
    pub all_files: Vec<FileEntry>,
    #[serde(skip)]
    pub nodes: HashMap<String, Node>,
    #[serde(skip)]
    pub duplicates: Vec<DuplicateGroup>,
    #[serde(skip)]
    pub entries: HashMap<String, crate::catalog_cache::IndexedFile>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub hash: String,
    pub logical_bytes: u64,
    pub recoverable_bytes: u64,
    pub files: Vec<FileEntry>,
}
fn seconds(t: Result<std::time::SystemTime, std::io::Error>) -> Option<u64> {
    t.ok()?.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}
pub(crate) fn protected(path: &Path) -> Option<String> {
    let home = dirs::home_dir().unwrap_or_default();
    if [
        PathBuf::from("/System"),
        PathBuf::from("/Library"),
        PathBuf::from("/Applications"),
        PathBuf::from("/usr"),
        PathBuf::from("/bin"),
        PathBuf::from("/sbin"),
        home.join("Library"),
    ]
    .iter()
    .any(|p| path.starts_with(p))
        || path.components().any(|c| {
            let s = c.as_os_str().to_string_lossy();
            s == ".git" || s == ".Trash" || s.ends_with(".app")
        })
    {
        Some("Arquivo de sistema ou dados de app. Use a ferramenta específica.".into())
    } else {
        None
    }
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Unreadable {
    pub path: String,
    pub reason: String,
    pub permission: bool,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct DirectoryRevision {
    device: u64,
    inode: u64,
    modified: i64,
    modified_ns: i64,
    changed: i64,
    changed_ns: i64,
}
impl DirectoryRevision {
    pub(crate) fn read(m: &fs::Metadata) -> Self {
        use std::os::unix::fs::MetadataExt;
        Self {
            device: m.dev(),
            inode: m.ino(),
            modified: m.mtime(),
            modified_ns: m.mtime_nsec(),
            changed: m.ctime(),
            changed_ns: m.ctime_nsec(),
        }
    }
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DirectoryInventory {
    pub(crate) revision: DirectoryRevision,
    names: Vec<String>,
}
#[derive(Serialize, Deserialize)]
pub struct ScanRequest {
    pub root: String,
    pub protection: Protection,
    pub previous: HashMap<String, DirectoryInventory>,
}

pub fn scan(
    root: String,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
) -> Result<CatalogReport, String> {
    scan_incremental(
        ScanRequest {
            root,
            protection: Protection::default(),
            previous: HashMap::new(),
        },
        cancel,
        |p| {
            progress(Progress {
                visited: p.visited,
                path: p.path,
            })
        },
    )
}
pub fn scan_incremental(
    request: ScanRequest,
    cancel: &AtomicBool,
    progress: impl Fn(Detail),
) -> Result<CatalogReport, String> {
    let started = Instant::now();
    let root = PathBuf::from(&request.root);
    crate::engine::no_symlinks(&root)?;
    if !root.is_dir() || !root.is_absolute() {
        return Err("Escolha uma pasta absoluta existente".into());
    }
    if request.protection.excludes(&root) {
        return Err("Esta pasta está protegida nas Preferências".into());
    }
    let mut report = CatalogReport {
        id: stamp(),
        root: root.to_string_lossy().into(),
        created_at: now(),
        revision: 1,
        updated_at: now(),
        verified_at: now(),
        duplicates_checked: false,
        bytes: 0,
        files: vec![],
        projects: vec![],
        warnings: vec![],
        visited: 0,
        incomplete: false,
        cached: false,
        scanned_directories: 0,
        reused_directories: 0,
        elapsed_ms: 0,
        unreadable: vec![],
        inventory: HashMap::new(),
        all_files: vec![],
        nodes: HashMap::new(),
        duplicates: vec![],
        entries: HashMap::new(),
    };
    let mut seen = HashSet::new();
    let mut projects = HashMap::<PathBuf, Project>::new();
    let home = dirs::home_dir().unwrap_or_default();
    let skipped_scopes: Vec<PathBuf> = [
        "Library/Containers",
        "Library/Mail",
        "Library/Messages",
        "Library/Calendars",
        "Library/Safari",
    ]
    .iter()
    .map(|s| home.join(s))
    .filter(|p| p.starts_with(&root) && !root.starts_with(p) && p.exists())
    .collect();
    for p in &skipped_scopes {
        report.incomplete = true;
        report.warnings.push(format!("Dados protegidos preservados: {}. Escolha esta pasta explicitamente para solicitar leitura.", p.display()));
        report.unreadable.push(Unreadable {
            path: p.to_string_lossy().into(),
            reason: "Leitura opcional de dados protegidos pelo macOS".into(),
            permission: true,
        });
    }
    let mut stack = vec![root.clone()];
    let mut last_progress = Instant::now();
    while let Some(p) = stack.pop() {
        if cancel.load(Ordering::Relaxed) {
            return Err("Análise cancelada".into());
        }
        if request.protection.excludes(&p) {
            report.incomplete = true;
            report
                .warnings
                .push(format!("Pasta protegida por você: {}", p.display()));
            continue;
        }
        if skipped_scopes.iter().any(|s| p.starts_with(s))
            || p.file_name().is_some_and(|n| n == ".git" || n == ".Trash")
        {
            continue;
        }
        let key = p.to_string_lossy().to_string();
        let meta = match fs::symlink_metadata(&p) {
            Ok(m) if !m.file_type().is_symlink() => m,
            Ok(_) => continue,
            Err(e) => {
                unreadable(&mut report, &p, &e);
                continue;
            }
        };
        report.visited += 1;
        if report.visited > 500_000 {
            report.incomplete = true;
            report
                .warnings
                .push("Limite de 500 mil entradas atingido. Analise uma pasta menor.".into());
            break;
        }
        if last_progress.elapsed().as_millis() >= 200 || report.visited == 1 {
            progress(detail(
                &report,
                &key,
                started.elapsed().as_millis() as u64,
                if meta.is_dir() {
                    "Lendo pasta"
                } else {
                    "Conferindo arquivos"
                },
            ));
            last_progress = Instant::now();
        }
        if meta.is_dir() {
            report.nodes.insert(
                key.clone(),
                Node {
                    path: key.clone(),
                    name: p.file_name().unwrap_or_default().to_string_lossy().into(),
                    bytes: 0,
                    directory: true,
                    incomplete: false,
                },
            );
            let eco = if p.join("Cargo.toml").is_file() {
                "Rust"
            } else if p.join("package.json").is_file() {
                "JavaScript"
            } else if p.join("project.godot").is_file() {
                "Godot"
            } else if p.join("pyproject.toml").is_file() {
                "Python"
            } else {
                ""
            };
            if !eco.is_empty()
                && !p.components().any(|c| {
                    ["node_modules", "target", ".venv", ".godot"]
                        .contains(&c.as_os_str().to_string_lossy().as_ref())
                })
            {
                projects.insert(
                    p.clone(),
                    Project {
                        path: key.clone(),
                        name: p.file_name().unwrap_or_default().to_string_lossy().into(),
                        ecosystem: eco.into(),
                        ..Default::default()
                    },
                );
            }
            let revision = DirectoryRevision::read(&meta);
            let cached = request
                .previous
                .get(&key)
                .filter(|c| c.revision == revision && c.names.iter().all(|n| valid_name(n)));
            let names = if let Some(cached) = cached {
                report.reused_directories += 1;
                cached.names.clone()
            } else {
                report.scanned_directories += 1;
                if last_progress.elapsed().as_millis() >= 200 {
                    progress(detail(
                        &report,
                        &key,
                        started.elapsed().as_millis() as u64,
                        "Lendo pasta",
                    ));
                    last_progress = Instant::now();
                }
                match fs::read_dir(&p).and_then(|entries| {
                    entries
                        .map(|e| e.map(|e| e.file_name().to_string_lossy().to_string()))
                        .collect::<Result<Vec<_>, _>>()
                }) {
                    Ok(names) => names,
                    Err(e) => {
                        unreadable(&mut report, &p, &e);
                        continue;
                    }
                }
            };
            let mut names = names;
            names.sort();
            // Do not cache an inventory captured while the directory was changing.
            if fs::symlink_metadata(&p).is_ok_and(|m| DirectoryRevision::read(&m) == revision) {
                report.inventory.insert(
                    key,
                    DirectoryInventory {
                        revision,
                        names: names.clone(),
                    },
                );
            } else {
                report.incomplete = true;
                report
                    .warnings
                    .push(format!("Pasta alterada durante leitura: {}", p.display()));
            }
            for name in names.into_iter().rev().filter(|n| valid_name(n)) {
                stack.push(p.join(name));
            }
            continue;
        }
        if !meta.is_file() {
            continue;
        }
        let (device, inode) = crate::engine::identity(&meta);
        let size = if seen.insert((device, inode)) {
            allocated(&meta)
        } else {
            0
        };
        let logical = meta.len();
        report
            .entries
            .insert(key.clone(), crate::catalog_cache::IndexedFile::read(&meta));
        report.bytes += size;
        report.nodes.insert(
            key.clone(),
            Node {
                path: key.clone(),
                name: p.file_name().unwrap_or_default().to_string_lossy().into(),
                bytes: size,
                directory: false,
                incomplete: false,
            },
        );
        for parent in p
            .ancestors()
            .skip(1)
            .take_while(|parent| parent.starts_with(&root))
        {
            if let Some(n) = report.nodes.get_mut(&parent.to_string_lossy().to_string()) {
                n.bytes += size;
            }
        }
        if size > 0 && logical >= 1_048_576 {
            report.all_files.push(FileEntry {
                id: crate::catalog_cache::file_id(&p, &Fingerprint::from_metadata(&meta)),
                path: key,
                name: p.file_name().unwrap_or_default().to_string_lossy().into(),
                bytes: size,
                logical_bytes: logical,
                modified: seconds(meta.modified()).unwrap_or(0),
                accessed: seconds(meta.accessed()),
                kind: p
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_else(|| "sem extensão".into()),
                blocked: request.protection.reason(&p).or_else(|| protected(&p)),
                fingerprint: Some(Fingerprint::from_metadata(&meta)),
            });
        }
    }
    // Project ownership is the nearest manifest, so nested projects do not inflate the parent.
    let mut owners: Vec<_> = projects.keys().cloned().collect();
    owners.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for node in report.nodes.values().filter(|n| !n.directory) {
        let p = Path::new(&node.path);
        if let Some(owner) = owners.iter().find(|o| p.starts_with(o)) {
            let project = projects.get_mut(owner).unwrap();
            project.bytes += node.bytes;
            let relative = p.strip_prefix(owner).unwrap();
            let parts: Vec<_> = relative
                .components()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .collect();
            if parts
                .iter()
                .any(|s| ["node_modules", ".venv", ".vision-venv"].contains(&s.as_str()))
            {
                project.dependency_bytes += node.bytes
            } else if parts.iter().any(|s| {
                ["target", ".next", ".godot", "dist", "build", "__pycache__"].contains(&s.as_str())
            }) {
                project.build_bytes += node.bytes
            }
        }
    }
    report.projects = projects.into_values().collect();
    report.projects.sort_by_key(|p| std::cmp::Reverse(p.bytes));
    report.files = report
        .all_files
        .iter()
        .filter(|f| f.logical_bytes >= 50_000_000)
        .cloned()
        .collect();
    report.files.sort_by_key(|f| std::cmp::Reverse(f.bytes));
    report.files.truncate(5000);
    crate::catalog_cache::rebuild(&mut report, &request.protection);
    if report.incomplete {
        for n in report.nodes.values_mut() {
            if n.directory {
                n.incomplete = true;
            }
        }
    }
    report.elapsed_ms = started.elapsed().as_millis() as u64;
    progress(detail(
        &report,
        &report.root,
        report.elapsed_ms,
        "Análise concluída",
    ));
    Ok(report)
}
fn valid_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains('/') && !name.contains('\0')
}
fn unreadable(report: &mut CatalogReport, path: &Path, error: &std::io::Error) {
    report.incomplete = true;
    if report.unreadable.len() < 200 {
        report.unreadable.push(Unreadable {
            path: path.to_string_lossy().into(),
            reason: error.to_string(),
            permission: error.kind() == std::io::ErrorKind::PermissionDenied,
        });
    }
    if report.warnings.len() < 200 {
        report.warnings.push(format!("{}: {error}", path.display()));
    }
}
fn detail(r: &CatalogReport, path: &str, elapsed_ms: u64, stage: &str) -> Detail {
    Detail {
        visited: r.visited,
        path: path.into(),
        bytes: r.bytes,
        elapsed_ms,
        scanned_directories: r.scanned_directories,
        reused_directories: r.reused_directories,
        stage: stage.into(),
    }
}
pub fn children(report: &CatalogReport, path: &str) -> Result<Vec<Node>, String> {
    if !report.nodes.get(path).is_some_and(|n| n.directory) {
        return Err("Pasta fora da análise atual".into());
    }
    let mut nodes: Vec<_> = if let Some(inv) = report.inventory.get(path) {
        let parent = Path::new(path);
        inv.names
            .iter()
            .filter_map(|name| {
                let child_key = parent.join(name).to_string_lossy().to_string();
                report.nodes.get(&child_key).cloned()
            })
            .collect()
    } else {
        report
            .nodes
            .values()
            .filter(|n| Path::new(&n.path).parent() == Some(Path::new(path)))
            .cloned()
            .collect()
    };
    nodes.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.name.cmp(&b.name)));
    Ok(nodes)
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderReview {
    pub scan_id: String,
    pub revision: u64,
    pub path: String,
    pub bytes: u64,
    pub files: u64,
}

pub fn review_folder(
    report: &CatalogReport,
    path: &str,
    policy: &Protection,
    cancel: &AtomicBool,
) -> Result<FolderReview, String> {
    let p = Path::new(path);
    if !p.is_absolute()
        || p == Path::new(&report.root)
        || dirs::home_dir().as_deref() == Some(p)
        || !p.starts_with(&report.root)
        || p.components().any(|c| {
            matches!(
                c,
                std::path::Component::ParentDir | std::path::Component::CurDir
            )
        })
    {
        return Err("Escolha uma subpasta do mapa atual".into());
    }
    let node = report
        .nodes
        .get(path)
        .filter(|n| n.directory && !n.incomplete)
        .ok_or("Pasta fora da análise atual ou com leitura parcial")?;
    policy.check(p)?;
    crate::engine::no_symlinks(p)?;
    let mut files = 0;
    // Validate every entry, including small files absent from the large-file list.
    for entry in walkdir::WalkDir::new(p).follow_links(false) {
        if cancel.load(Ordering::Relaxed) {
            return Err("Operação interrompida".into());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let item = entry.path();
        policy.check(item)?;
        if let Some(reason) = protected(item) {
            return Err(reason);
        }
        let meta = fs::symlink_metadata(item).map_err(|e| e.to_string())?;
        let key = item.to_str().ok_or("Caminho não UTF-8; preservado")?;
        if meta.is_dir() {
            let inventory = report
                .inventory
                .get(key)
                .ok_or("Pasta sem leitura completa; analise novamente")?;
            if DirectoryRevision::read(&meta) != inventory.revision {
                return Err(format!("Pasta alterada; analise novamente: {key}"));
            }
        } else if meta.is_file() {
            let indexed = report
                .entries
                .get(key)
                .ok_or("Arquivo novo; analise novamente")?;
            indexed.fingerprint.validate(item)?;
            files += 1;
        } else {
            return Err(format!("Link simbólico ou item especial preservado: {key}"));
        }
    }
    // Recheck directories after traversal, catching additions/removals during validation.
    for (key, inventory) in &report.inventory {
        if Path::new(key).starts_with(p) {
            crate::engine::no_symlinks(Path::new(key))?;
            let meta = fs::symlink_metadata(key).map_err(|e| e.to_string())?;
            if DirectoryRevision::read(&meta) != inventory.revision {
                return Err(format!("Pasta alterada; analise novamente: {key}"));
            }
        }
    }
    Ok(FolderReview {
        scan_id: report.id.clone(),
        revision: report.revision,
        path: path.into(),
        bytes: node.bytes,
        files,
    })
}

pub fn trash_folder(
    report: &mut CatalogReport,
    path: &str,
    revision: u64,
    policy: &Protection,
    cancel: &AtomicBool,
) -> Result<CleanupRecord, String> {
    if revision != report.revision {
        return Err("O mapa mudou. Revise a pasta novamente.".into());
    }
    let review = review_folder(report, path, policy, cancel)?;
    if cancel.load(Ordering::Relaxed) {
        return Err("Operação interrompida".into());
    }
    let recovery = trash_path(Path::new(path))?;
    let mut record = CleanupRecord::new("trash");
    record.removed.push(path.into());
    record.recovery.push(recovery);
    record.removed_bytes = review.bytes;
    record.moved_bytes = review.bytes;
    crate::catalog_cache::remove_paths(report, &record.removed, policy);
    Ok(record)
}
fn hash_file(file: &FileEntry, cancel: &AtomicBool) -> Result<String, String> {
    let p = Path::new(&file.path);
    let fingerprint = file
        .fingerprint
        .as_ref()
        .ok_or("Arquivo sem identificação")?;
    fingerprint.validate(p)?;
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let mut reader = options.open(p).map_err(|e| e.to_string())?;
    let meta = reader.metadata().map_err(|e| e.to_string())?;
    if crate::engine::identity(&meta) != (fingerprint.device, fingerprint.inode) {
        return Err("Arquivo substituído durante leitura".into());
    }
    let mut hasher = blake3::Hasher::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Análise cancelada".into());
        }
        let n = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    fingerprint.validate(p)?;
    Ok(hasher.finalize().to_hex().to_string())
}
pub fn duplicates(
    report: &mut CatalogReport,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
) -> Result<Vec<DuplicateGroup>, String> {
    let mut sizes: HashMap<u64, Vec<&FileEntry>> = HashMap::new();
    for f in &report.all_files {
        if f.blocked.is_none() {
            sizes.entry(f.logical_bytes).or_default().push(f)
        }
    }
    let mut hashed: HashMap<String, Vec<FileEntry>> = HashMap::new();
    let mut visited = 0;
    for files in sizes.values().filter(|v| v.len() > 1) {
        for f in files {
            visited += 1;
            progress(Progress {
                visited,
                path: f.path.clone(),
            });
            match hash_file(f, cancel) {
                Ok(hash) => hashed.entry(hash).or_default().push((*f).clone()),
                Err(e) => {
                    if cancel.load(Ordering::Relaxed) {
                        return Err(e);
                    }
                    report.warnings.push(format!("{}: {e}", f.path));
                }
            }
        }
    }
    let mut groups: Vec<_> = hashed
        .into_iter()
        .filter(|(_, v)| v.len() > 1)
        .map(|(hash, mut files)| {
            files.sort_by(|a, b| a.path.cmp(&b.path));
            let total: u64 = files.iter().map(|f| f.bytes).sum();
            let keep = files.iter().map(|f| f.bytes).max().unwrap_or(0);
            DuplicateGroup {
                hash,
                logical_bytes: files[0].logical_bytes,
                recoverable_bytes: total.saturating_sub(keep),
                files,
            }
        })
        .collect();
    groups.sort_by_key(|g| std::cmp::Reverse(g.recoverable_bytes));
    report.duplicates = groups.clone();
    report.duplicates_checked = true;
    report.revision += 1;
    Ok(groups)
}
pub fn validate_selection<'a>(
    report: &'a CatalogReport,
    ids: &[String],
    duplicate_mode: bool,
    cancel: &AtomicBool,
) -> Result<Vec<&'a FileEntry>, String> {
    let files = resolve_selection(report, ids)?;
    for f in &files {
        f.fingerprint
            .as_ref()
            .ok_or("Arquivo sem identificação")?
            .validate(Path::new(&f.path))?;
    }
    validate_duplicates(report, &files, ids, duplicate_mode, cancel)?;
    Ok(files)
}
fn resolve_selection<'a>(
    report: &'a CatalogReport,
    ids: &[String],
) -> Result<Vec<&'a FileEntry>, String> {
    let selected: HashSet<_> = ids.iter().collect();
    if selected.is_empty() {
        return Err("Selecione arquivos para revisar".into());
    }
    let files: Vec<_> = report
        .all_files
        .iter()
        .filter(|f| selected.contains(&f.id))
        .collect();
    if files.len() != selected.len() {
        return Err("Seleção fora da análise".into());
    }
    for f in &files {
        let path = Path::new(&f.path);
        if !Path::new(&report.root).is_absolute()
            || !path.is_absolute()
            || !path.starts_with(&report.root)
            || path
                .components()
                .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err("Arquivo fora da raiz do índice".into());
        }
        if let Some(reason) = &f.blocked {
            return Err(reason.clone());
        }
    }
    Ok(files)
}
fn validate_duplicates(
    report: &CatalogReport,
    files: &[&FileEntry],
    ids: &[String],
    duplicate_mode: bool,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let selected: HashSet<_> = ids.iter().collect();
    if duplicate_mode {
        for file in files {
            let group = report
                .duplicates
                .iter()
                .find(|g| g.files.iter().any(|f| f.id == file.id))
                .ok_or("Arquivo não confirmado como duplicado")?;
            if hash_file(file, cancel)? != group.hash {
                return Err("Conteúdo do duplicado mudou".into());
            }
            let mut survivor = false;
            for remaining in group.files.iter().filter(|f| !selected.contains(&f.id)) {
                if hash_file(remaining, cancel).is_ok_and(|h| h == group.hash) {
                    survivor = true;
                    break;
                }
            }
            if !survivor {
                return Err("Preserve pelo menos uma cópia íntegra de cada grupo".into());
            }
        }
    }
    Ok(())
}
pub fn trash(
    report: &mut CatalogReport,
    ids: Vec<String>,
    duplicate_mode: bool,
    cancel: &AtomicBool,
) -> Result<CleanupRecord, String> {
    if ids.is_empty() {
        return Err("Selecione arquivos para revisar".into());
    }
    let known: HashSet<_> = report.all_files.iter().map(|f| f.id.clone()).collect();
    let valid_ids: Vec<_> = ids
        .iter()
        .filter(|id| known.contains(*id))
        .cloned()
        .collect();
    let mut record = CleanupRecord::new("trash");
    for id in ids.iter().filter(|id| !known.contains(*id)) {
        record.skipped.push(format!(
            "Item já saiu do índice ou mudou; seleção preservada sem exclusão: {id}"
        ));
    }
    if valid_ids.is_empty() {
        return Ok(record);
    }
    let files = resolve_selection(report, &valid_ids)?;
    validate_duplicates(report, &files, &valid_ids, duplicate_mode, cancel)?;
    let files: Vec<FileEntry> = files.into_iter().cloned().collect();

    for f in files {
        if cancel.load(Ordering::Relaxed) {
            record
                .skipped
                .push("Operação interrompida entre arquivos".into());
            break;
        }
        let p = Path::new(&f.path);
        match f
            .fingerprint
            .as_ref()
            .unwrap()
            .validate(p)
            .and_then(|_| trash_path(p))
        {
            Ok(recovery) => {
                record.recovery.push(recovery);
                record.removed.push(f.path.clone());
                record.removed_bytes += f.bytes;
                record.moved_bytes += f.bytes
            }
            Err(e) => record.skipped.push(format!("{}: {e}", f.path)),
        }
    }
    record.freed_bytes = 0;
    crate::catalog_cache::remove_paths(report, &record.removed, &Protection::default());
    Ok(record)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn folder_fixture() -> (tempfile::TempDir, CatalogReport, String) {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        let folder = d.path().join("folder");
        fs::create_dir_all(folder.join("nested")).unwrap();
        fs::write(folder.join("nested/small.txt"), "keep until confirmed").unwrap();
        fs::write(d.path().join("sibling.txt"), "preserve").unwrap();
        let report = scan(
            d.path().to_string_lossy().into(),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        (d, report, folder.to_string_lossy().into())
    }
    #[test]
    fn folder_review_covers_small_files_and_rejects_outside_root_and_protection() {
        let (d, r, path) = folder_fixture();
        let review =
            review_folder(&r, &path, &Protection::default(), &AtomicBool::new(false)).unwrap();
        assert_eq!(review.files, 1);
        assert_eq!(review.bytes, r.nodes[&path].bytes);
        for bad in [&r.root, "/etc", &format!("{path}/../folder")] {
            assert!(
                review_folder(&r, bad, &Protection::default(), &AtomicBool::new(false)).is_err()
            );
        }
        let protected = Protection {
            paths: vec![format!("{path}/nested")],
        };
        assert!(review_folder(&r, &path, &protected, &AtomicBool::new(false)).is_err());
        assert!(d.path().join("sibling.txt").exists());
    }
    #[test]
    fn folder_review_rejects_changed_content_symlinks_and_partial_inventory() {
        let (_d, mut r, path) = folder_fixture();
        fs::write(format!("{path}/nested/small.txt"), "changed").unwrap();
        assert!(review_folder(&r, &path, &Protection::default(), &AtomicBool::new(false)).is_err());
        r = scan(r.root, &AtomicBool::new(false), |_| {}).unwrap();
        std::os::unix::fs::symlink("/etc", format!("{path}/link")).unwrap();
        r = scan(r.root, &AtomicBool::new(false), |_| {}).unwrap();
        assert!(review_folder(&r, &path, &Protection::default(), &AtomicBool::new(false)).is_err());
        fs::remove_file(format!("{path}/link")).unwrap();
        r = scan(r.root, &AtomicBool::new(false), |_| {}).unwrap();
        r.inventory.remove(&format!("{path}/nested"));
        assert!(review_folder(&r, &path, &Protection::default(), &AtomicBool::new(false)).is_err());
    }
    #[test]
    fn folder_trash_rejects_stale_review_and_cancellation() {
        let (_d, mut r, path) = folder_fixture();
        let revision = r.revision;
        assert!(trash_folder(
            &mut r,
            &path,
            revision + 1,
            &Protection::default(),
            &AtomicBool::new(false)
        )
        .is_err());
        assert!(trash_folder(
            &mut r,
            &path,
            revision,
            &Protection::default(),
            &AtomicBool::new(true)
        )
        .is_err());
        assert!(Path::new(&path).exists());
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn folder_trash_moves_only_selected_subtree_and_can_restore_it() {
        let (d, mut r, path) = folder_fixture();
        let revision = r.revision;
        let mut record = trash_folder(
            &mut r,
            &path,
            revision,
            &Protection::default(),
            &AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(record.removed, vec![path.clone()]);
        assert_eq!(record.freed_bytes, 0);
        assert!(!Path::new(&path).exists());
        assert!(d.path().join("sibling.txt").exists());
        assert!(!r.nodes.keys().any(|key| Path::new(key).starts_with(&path)));
        crate::native::restore(&mut record.recovery[0]).unwrap();
        assert!(Path::new(&format!("{path}/nested/small.txt")).exists());
    }
    use tempfile::tempdir_in;
    fn fixture() -> (tempfile::TempDir, CatalogReport) {
        let d = tempdir_in("/private/tmp").unwrap();
        fs::write(d.path().join("a.bin"), vec![7u8; 1_048_576]).unwrap();
        fs::write(d.path().join("b.bin"), vec![7u8; 1_048_576]).unwrap();
        fs::write(d.path().join("same-size.bin"), vec![8u8; 1_048_576]).unwrap();
        let r = scan(
            d.path().to_string_lossy().into(),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        (d, r)
    }
    #[test]
    fn hashes_content_and_keeps_one_copy() {
        let (_d, mut r) = fixture();
        let c = AtomicBool::new(false);
        let g = duplicates(&mut r, &c, |_| {}).unwrap();
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].files.len(), 2);
        let all = g[0].files.iter().map(|f| f.id.clone()).collect::<Vec<_>>();
        assert!(validate_selection(&r, &all, true, &c).is_err());
        assert!(validate_selection(&r, &all[..1], true, &c).is_ok());
    }
    #[test]
    fn changed_survivor_blocks_cleanup() {
        let (_d, mut r) = fixture();
        let c = AtomicBool::new(false);
        let g = duplicates(&mut r, &c, |_| {}).unwrap();
        fs::write(&g[0].files[1].path, vec![9u8; 1_048_576]).unwrap();
        assert!(validate_selection(&r, &[g[0].files[0].id.clone()], true, &c).is_err());
    }
    #[test]
    fn hardlinks_are_not_duplicate_copies() {
        let (d, mut r) = fixture();
        fs::hard_link(d.path().join("a.bin"), d.path().join("link.bin")).unwrap();
        r = scan(r.root, &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(r.all_files.len(), 3);
        assert_eq!(
            duplicates(&mut r, &AtomicBool::new(false), |_| {}).unwrap()[0]
                .files
                .len(),
            2
        );
    }
    #[test]
    fn forged_ids_and_paths_are_rejected() {
        let (_d, r) = fixture();
        assert!(
            validate_selection(&r, &["forged".into()], false, &AtomicBool::new(false)).is_err()
        );
        assert!(children(&r, "/etc").is_err());
    }
    #[test]
    fn children_uses_inventory_and_falls_back_when_missing() {
        let (_d, mut report) = fixture();
        let root = report.root.clone();
        assert!(report.inventory.contains_key(&root));
        let with_inv = children(&report, &root).unwrap();
        assert_eq!(with_inv.len(), 3);
        report.inventory.remove(&root);
        let fallback = children(&report, &root).unwrap();
        assert_eq!(fallback.len(), 3);
        assert_eq!(
            with_inv.iter().map(|n| &n.path).collect::<Vec<_>>(),
            fallback.iter().map(|n| &n.path).collect::<Vec<_>>()
        );
    }
    #[test]
    fn cleanup_keeps_remaining_catalog_and_persists_removal() {
        let (_d, mut report) = fixture();
        let cancel = AtomicBool::new(false);
        let removed = report.all_files[0].clone();
        let remaining = report.all_files[1].clone();
        let before = report.bytes;
        let mut record = trash(&mut report, vec![removed.id.clone()], false, &cancel).unwrap();
        // Restore our disposable fixture even when the assertions below fail.
        assert_eq!(record.removed.len(), 1);
        crate::native::restore(&mut record.recovery[0]).unwrap();
        assert!(
            report.all_files.iter().all(|f| f.path != removed.path),
            "o arquivo enviado à Lixeira continua no índice"
        );
        assert_eq!(report.bytes, before - removed.bytes);
        assert!(validate_selection(&report, &[remaining.id], false, &cancel).is_ok());
        let saved = serde_json::to_vec(&WorkerCatalog::from_report(report)).unwrap();
        let reopened = serde_json::from_slice::<WorkerCatalog>(&saved)
            .unwrap()
            .into_report();
        assert!(
            reopened.all_files.iter().all(|f| f.path != removed.path),
            "reabrir trouxe de volta um registro removido"
        );
        assert_eq!(children(&reopened, &reopened.root).unwrap().len(), 2);
    }
    #[test]
    fn stale_selection_ignores_already_cleaned_id_and_cleans_remaining_selected_file() {
        let (_d, mut report) = fixture();
        let first = report.all_files[0].id.clone();
        let second = report.all_files[1].id.clone();
        let mut a = trash(
            &mut report,
            vec![first.clone()],
            false,
            &AtomicBool::new(false),
        )
        .unwrap();
        let mut b = trash(
            &mut report,
            vec![first, second],
            false,
            &AtomicBool::new(false),
        )
        .unwrap();
        for item in a.recovery.iter_mut().chain(b.recovery.iter_mut()) {
            crate::native::restore(item).unwrap();
        }
        assert_eq!(a.removed.len(), 1);
        assert_eq!(b.removed.len(), 1);
        assert_eq!(b.skipped.len(), 1);
        assert_eq!(report.all_files.len(), 1);
    }
}
// Private subprocess transport. Native identity metadata never crosses the frontend IPC.
#[derive(Serialize, Deserialize)]
pub struct WorkerCatalog {
    report: CatalogReport,
    files: Vec<FileEntry>,
    nodes: HashMap<String, Node>,
    fingerprints: HashMap<String, Fingerprint>,
    #[serde(default)]
    inventory: HashMap<String, DirectoryInventory>,
    #[serde(default)]
    entries: HashMap<String, crate::catalog_cache::IndexedFile>,
}
impl WorkerCatalog {
    pub fn from_report(mut report: CatalogReport) -> Self {
        let inventory = std::mem::take(&mut report.inventory);
        let entries = std::mem::take(&mut report.entries);
        let files = std::mem::take(&mut report.all_files);
        let fingerprints = files
            .iter()
            .filter_map(|f| f.fingerprint.clone().map(|fp| (f.id.clone(), fp)))
            .collect();
        let nodes = std::mem::take(&mut report.nodes);
        Self {
            report,
            files,
            nodes,
            fingerprints,
            inventory,
            entries,
        }
    }
    pub fn into_report(mut self) -> CatalogReport {
        for f in &mut self.files {
            f.fingerprint = self.fingerprints.remove(&f.id)
        }
        self.report.inventory = self.inventory;
        self.report.entries = self.entries;
        self.report.all_files = self.files;
        self.report.nodes = self.nodes;
        self.report
    }
}
pub fn scan_request_isolated(
    request_path: &Path,
    cancel: &AtomicBool,
    progress: impl Fn(Detail) + Send + 'static,
) -> Result<CatalogReport, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let output = crate::native::run_with_lines(
        &exe,
        &[
            "--folga-worker-catalog-incremental".into(),
            request_path.to_string_lossy().into(),
        ],
        cancel,
        600,
        move |line| {
            if let Ok(p) = serde_json::from_str::<Detail>(line) {
                progress(p);
            }
        },
    )?;
    let r: Result<WorkerCatalog, String> = serde_json::from_slice(&output)
        .map_err(|e| format!("Resposta da análise nativa inválida: {e}"))?;
    r.map(WorkerCatalog::into_report)
}
impl CatalogReport {
    pub fn summary(&self) -> Self {
        Self {
            id: self.id.clone(),
            root: self.root.clone(),
            created_at: self.created_at,
            revision: self.revision,
            updated_at: self.updated_at,
            verified_at: self.verified_at,
            duplicates_checked: self.duplicates_checked,
            bytes: self.bytes,
            files: self.files.clone(),
            projects: self.projects.clone(),
            warnings: self.warnings.clone(),
            visited: self.visited,
            incomplete: self.incomplete,
            cached: self.cached,
            scanned_directories: self.scanned_directories,
            reused_directories: self.reused_directories,
            elapsed_ms: self.elapsed_ms,
            unreadable: self.unreadable.clone(),
            all_files: vec![],
            inventory: HashMap::new(),
            nodes: HashMap::new(),
            duplicates: vec![],
            entries: HashMap::new(),
        }
    }
}
pub fn scan_isolated(path: String, cancel: &AtomicBool) -> Result<CatalogReport, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let output = crate::native::run(&exe, &["--folga-worker-catalog".into(), path], cancel, 180)?;
    let r: Result<WorkerCatalog, String> = serde_json::from_slice(&output)
        .map_err(|e| format!("Resposta da análise nativa inválida: {e}"))?;
    r.map(WorkerCatalog::into_report)
}
#[cfg(test)]
mod worker_tests {
    use super::*;
    #[test]
    fn worker_transport_keeps_native_identity_without_frontend_exposure() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        fs::write(d.path().join("sample.bin"), vec![1u8; 1_048_576]).unwrap();
        let r = scan(
            d.path().to_string_lossy().into(),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let bytes = serde_json::to_vec(&WorkerCatalog::from_report(r)).unwrap();
        let report = serde_json::from_slice::<WorkerCatalog>(&bytes)
            .unwrap()
            .into_report();
        assert!(validate_selection(
            &report,
            &[report.all_files[0].id.clone()],
            false,
            &AtomicBool::new(false)
        )
        .is_ok());
        assert_eq!(children(&report, &report.root).unwrap().len(), 1);
        assert!(serde_json::to_value(&report)
            .unwrap()
            .get("allFiles")
            .is_none());
    }
}

#[cfg(test)]
mod incremental_tests {
    use super::*;
    fn update(
        root: &Path,
        previous: HashMap<String, DirectoryInventory>,
        protection: Protection,
    ) -> CatalogReport {
        scan_incremental(
            ScanRequest {
                root: root.to_string_lossy().into(),
                previous,
                protection,
            },
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap()
    }
    #[test]
    fn reuses_directory_listing_but_detects_file_changes_and_new_descendants() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        let sub = d.path().join("sub");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("a.bin"), vec![1u8; 1_048_576]).unwrap();
        let first = update(d.path(), HashMap::new(), Protection::default());
        let second = update(d.path(), first.inventory.clone(), Protection::default());
        assert_eq!(second.reused_directories, 2);
        assert_eq!(second.scanned_directories, 0);
        assert_eq!(second.bytes, first.bytes);
        fs::write(sub.join("a.bin"), vec![2u8; 2_097_152]).unwrap();
        let third = update(d.path(), second.inventory, Protection::default());
        assert_eq!(third.reused_directories, 2);
        assert_eq!(third.all_files[0].logical_bytes, 2_097_152);
        assert!(first.all_files[0]
            .fingerprint
            .as_ref()
            .unwrap()
            .validate(&sub.join("a.bin"))
            .is_err());
        fs::write(sub.join("b.bin"), vec![3u8; 1_048_576]).unwrap();
        let fourth = update(d.path(), third.inventory, Protection::default());
        assert_eq!(fourth.all_files.len(), 2);
        assert_eq!(fourth.reused_directories, 1);
        assert_eq!(fourth.scanned_directories, 1);
        fs::remove_file(sub.join("a.bin")).unwrap();
        let fifth = update(d.path(), fourth.inventory, Protection::default());
        assert_eq!(fifth.all_files.len(), 1);
        assert!(fifth.all_files[0].path.ends_with("b.bin"));
    }
    #[test]
    fn persisted_report_validates_selected_identity_without_full_rescan() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        fs::write(d.path().join("a.bin"), vec![1u8; 1_048_576]).unwrap();
        let report = update(d.path(), HashMap::new(), Protection::default());
        let bytes = serde_json::to_vec(&WorkerCatalog::from_report(report)).unwrap();
        let mut restored = serde_json::from_slice::<WorkerCatalog>(&bytes)
            .unwrap()
            .into_report();
        restored.cached = true;
        assert_eq!(children(&restored, &restored.root).unwrap().len(), 1);
        assert!(validate_selection(
            &restored,
            &[restored.all_files[0].id.clone()],
            false,
            &AtomicBool::new(false)
        )
        .is_ok());
        assert!(duplicates(&mut restored, &AtomicBool::new(false), |_| {}).is_ok());
        fs::write(d.path().join("a.bin"), vec![9u8; 1_048_576]).unwrap();
        assert!(validate_selection(
            &restored,
            &[restored.all_files[0].id.clone()],
            false,
            &AtomicBool::new(false)
        )
        .is_err());
    }
    #[test]
    fn protection_applies_to_cached_inventories_and_blocks_parent_removal() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        let db = d.path().join("db");
        fs::create_dir(&db).unwrap();
        fs::write(db.join("data.bin"), vec![1u8; 1_048_576]).unwrap();
        let first = update(d.path(), HashMap::new(), Protection::default());
        let policy = Protection::normalized(vec![db.to_string_lossy().into()]).unwrap();
        let protected = update(d.path(), first.inventory, policy.clone());
        assert_eq!(protected.bytes, 0);
        assert!(protected.all_files.is_empty());
        assert!(protected.incomplete);
        assert!(policy.check(d.path()).is_err());
        assert!(db.join("data.bin").exists());
    }
    #[test]
    fn traversal_names_in_cached_inventory_are_rejected() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        fs::write(d.path().join("local.txt"), "keep").unwrap();
        let mut first = update(d.path(), HashMap::new(), Protection::default());
        first
            .inventory
            .get_mut(&first.root)
            .unwrap()
            .names
            .push("../../etc".into());
        let second = update(d.path(), first.inventory, Protection::default());
        assert_eq!(second.reused_directories, 0);
        assert_eq!(second.nodes.len(), 2);
        assert!(second
            .nodes
            .keys()
            .all(|p| Path::new(p).starts_with(d.path())));
    }
    #[test]
    fn permission_denial_is_structured_and_can_be_retried_by_scope() {
        use std::os::unix::fs::PermissionsExt;
        if unsafe { libc::geteuid() } == 0 {
            return;
        }
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        let denied = d.path().join("denied");
        fs::create_dir(&denied).unwrap();
        fs::set_permissions(&denied, fs::Permissions::from_mode(0o000)).unwrap();
        let r = update(d.path(), HashMap::new(), Protection::default());
        fs::set_permissions(&denied, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(r.incomplete);
        assert!(r
            .unreadable
            .iter()
            .any(|p| p.permission && Path::new(&p.path) == denied));
        let retry = update(&denied, HashMap::new(), Protection::default());
        assert!(!retry.incomplete);
    }
}
