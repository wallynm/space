//! The durable catalog is updated by path, independently of UI selections.
use crate::{
    catalog::*,
    engine::{allocated, now},
    native::Fingerprint,
    policy::Protection,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Instant, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IndexedFile {
    pub fingerprint: Fingerprint,
    pub allocated_bytes: u64,
    pub modified: u64,
    pub accessed: Option<u64>,
}
impl IndexedFile {
    pub fn read(meta: &fs::Metadata) -> Self {
        Self {
            fingerprint: Fingerprint::from_metadata(meta),
            allocated_bytes: allocated(meta),
            modified: meta
                .modified()
                .ok()
                .and_then(|v| v.duration_since(UNIX_EPOCH).ok())
                .map(|v| v.as_secs())
                .unwrap_or(0),
            accessed: meta
                .accessed()
                .ok()
                .and_then(|v| v.duration_since(UNIX_EPOCH).ok())
                .map(|v| v.as_secs()),
        }
    }
}
pub fn file_id(path: &Path, fp: &Fingerprint) -> String {
    let mut hash = blake3::Hasher::new();
    hash.update(path.as_os_str().as_encoded_bytes());
    hash.update(&fp.device.to_le_bytes());
    hash.update(&fp.inode.to_le_bytes());
    hash.update(&fp.size.to_le_bytes());
    hash.update(&fp.modified.to_le_bytes());
    hash.update(&fp.changed.to_le_bytes());
    format!("file-{}", hash.finalize().to_hex())
}
fn excluded(root: &Path, path: &Path, policy: &Protection) -> bool {
    if policy.excludes(path)
        || path
            .components()
            .any(|c| c.as_os_str() == ".git" || c.as_os_str() == ".Trash")
    {
        return true;
    }
    let home = dirs::home_dir().unwrap_or_default();
    [
        "Library/Containers",
        "Library/Mail",
        "Library/Messages",
        "Library/Calendars",
        "Library/Safari",
    ]
    .iter()
    .any(|s| {
        let scope = home.join(s);
        scope.starts_with(root) && !root.starts_with(&scope) && path.starts_with(scope)
    })
}
pub fn accepted_path(root: &Path, path: &Path, policy: &Protection) -> bool {
    path.is_absolute()
        && path.starts_with(root)
        && !path.components().any(|c| matches!(c, Component::ParentDir))
        && !excluded(root, path, policy)
}
/// Recalculate totals without touching the filesystem. Identity accounting includes small files.
pub fn rebuild(report: &mut CatalogReport, policy: &Protection) {
    let legacy: HashMap<_, _> = report
        .all_files
        .iter()
        .map(|f| (f.path.clone(), f.clone()))
        .collect();
    report
        .entries
        .retain(|p, _| report.nodes.get(p).is_some_and(|n| !n.directory));
    let mut paths: Vec<_> = report.nodes.keys().cloned().collect();
    paths.sort();
    let mut seen = HashSet::new();
    let mut files = vec![];
    for path in &paths {
        let node = report.nodes.get_mut(path).unwrap();
        if node.directory {
            node.bytes = 0;
            continue;
        }
        if let Some(entry) = report.entries.get(path) {
            let fp = &entry.fingerprint;
            node.bytes = if seen.insert((fp.device, fp.inode)) {
                entry.allocated_bytes
            } else {
                0
            };
            if fp.size >= 1_048_576 && node.bytes > 0 {
                let p = Path::new(path);
                files.push(FileEntry {
                    id: file_id(p, fp),
                    path: path.clone(),
                    name: node.name.clone(),
                    bytes: node.bytes,
                    logical_bytes: fp.size,
                    modified: entry.modified,
                    accessed: entry.accessed,
                    kind: p
                        .extension()
                        .map(|e| e.to_string_lossy().to_lowercase())
                        .unwrap_or_else(|| "sem extensão".into()),
                    blocked: policy
                        .reason(p)
                        .or_else(|| crate::catalog::protected(p))
                        .or_else(|| {
                            report
                                .unreadable
                                .iter()
                                .find(|u| p.starts_with(&u.path))
                                .map(|u| format!("Leitura pendente: {}", u.path))
                        }),
                    fingerprint: Some(fp.clone()),
                });
            }
        } else if let Some(old) = legacy.get(path) {
            // Upgrade the previous catalog in the background; keep its native identity meanwhile.
            files.push(old.clone());
        }
    }
    let root = Path::new(&report.root);
    let leaves: Vec<_> = report
        .nodes
        .values()
        .filter(|n| !n.directory)
        .map(|n| (n.path.clone(), n.bytes))
        .collect();
    report.bytes = leaves.iter().map(|(_, b)| b).sum();
    for (path, bytes) in &leaves {
        for parent in Path::new(path)
            .ancestors()
            .skip(1)
            .take_while(|p| p.starts_with(root))
        {
            if let Some(n) = report.nodes.get_mut(&parent.to_string_lossy().to_string()) {
                n.bytes += bytes;
            }
        }
    }
    let manifests = [
        ("Cargo.toml", "Rust"),
        ("package.json", "JavaScript"),
        ("project.godot", "Godot"),
        ("pyproject.toml", "Python"),
    ];
    let mut projects: Vec<Project> = report
        .nodes
        .values()
        .filter(|n| n.directory)
        .filter_map(|n| {
            let p = Path::new(&n.path);
            if p.components().any(|c| {
                ["node_modules", "target", ".venv", ".godot"]
                    .contains(&c.as_os_str().to_string_lossy().as_ref())
            }) {
                return None;
            }
            let ecosystem = manifests
                .iter()
                .find(|(name, _)| {
                    report
                        .nodes
                        .get(&p.join(name).to_string_lossy().to_string())
                        .is_some_and(|n| !n.directory)
                })?
                .1;
            Some(Project {
                path: n.path.clone(),
                name: n.name.clone(),
                ecosystem: ecosystem.into(),
                ..Default::default()
            })
        })
        .collect();
    projects.sort_by_key(|p| std::cmp::Reverse(Path::new(&p.path).components().count()));
    for (path, bytes) in leaves {
        let path = Path::new(&path);
        if let Some(owner) = projects.iter_mut().find(|p| path.starts_with(&p.path)) {
            owner.bytes += bytes;
            let parts: Vec<_> = path
                .strip_prefix(&owner.path)
                .unwrap()
                .components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect();
            if parts
                .iter()
                .any(|s| ["node_modules", ".venv", ".vision-venv"].contains(&s.as_ref()))
            {
                owner.dependency_bytes += bytes;
            } else if parts.iter().any(|s| {
                ["target", ".next", ".godot", "dist", "build", "__pycache__"].contains(&s.as_ref())
            }) {
                owner.build_bytes += bytes;
            }
        }
    }
    projects.sort_by_key(|p| std::cmp::Reverse(p.bytes));
    report.projects = projects;
    let current: HashMap<_, _> = files.iter().map(|f| (f.id.clone(), f)).collect();
    for group in &mut report.duplicates {
        group.files = group
            .files
            .iter()
            .filter_map(|f| current.get(&f.id).map(|f| (*f).clone()))
            .filter(|f| f.blocked.is_none())
            .collect();
        let total: u64 = group.files.iter().map(|f| f.bytes).sum();
        group.recoverable_bytes =
            total.saturating_sub(group.files.iter().map(|f| f.bytes).max().unwrap_or(0));
    }
    report.duplicates.retain(|g| g.files.len() > 1);
    report.all_files = files;
    report.files = report
        .all_files
        .iter()
        .filter(|f| f.logical_bytes >= 50_000_000)
        .cloned()
        .collect();
    report.files.sort_by_key(|f| std::cmp::Reverse(f.bytes));
    report.files.truncate(5000);
}
fn forget(report: &mut CatalogReport, path: &Path) {
    report.nodes.retain(|p, _| !Path::new(p).starts_with(path));
    report
        .entries
        .retain(|p, _| !Path::new(p).starts_with(path));
    report
        .all_files
        .retain(|f| !Path::new(&f.path).starts_with(path));
    report
        .inventory
        .retain(|p, _| !Path::new(p).starts_with(path) && !path.starts_with(p));
    report
        .unreadable
        .retain(|p| !Path::new(&p.path).starts_with(path));
}
pub fn remove_paths(report: &mut CatalogReport, paths: &[String], policy: &Protection) {
    if !paths
        .iter()
        .any(|p| report.nodes.keys().any(|n| Path::new(n).starts_with(p)))
    {
        return;
    }
    let identities: HashSet<_> = report
        .entries
        .iter()
        .filter(|(p, _)| paths.iter().any(|scope| Path::new(p).starts_with(scope)))
        .map(|(_, e)| (e.fingerprint.device, e.fingerprint.inode))
        .collect();
    for path in paths {
        if Path::new(path).starts_with(&report.root) {
            forget(report, Path::new(path));
        }
    }
    // A renamed/removed hardlink can change ctime of another indexed link to the same inode.
    for (path, entry) in &mut report.entries {
        if identities.contains(&(entry.fingerprint.device, entry.fingerprint.inode)) {
            if let Ok(meta) = fs::symlink_metadata(path) {
                if meta.is_file()
                    && !meta.file_type().is_symlink()
                    && crate::engine::identity(&meta)
                        == (entry.fingerprint.device, entry.fingerprint.inode)
                {
                    *entry = IndexedFile::read(&meta);
                }
            }
        }
    }
    rebuild(report, policy);
    report.revision += 1;
    report.updated_at = now();
}
fn upsert_file(report: &mut CatalogReport, path: &Path, meta: &fs::Metadata) {
    let key = path.to_string_lossy().to_string();
    if report.nodes.get(&key).is_some_and(|n| n.directory) {
        forget(report, path);
    }
    report.nodes.insert(
        key.clone(),
        Node {
            path: key.clone(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            bytes: 0,
            directory: false,
            incomplete: false,
        },
    );
    report.entries.insert(key, IndexedFile::read(meta));
}
fn add_issue(report: &mut CatalogReport, path: &Path, e: &std::io::Error) {
    report.incomplete = true;
    report.unreadable.retain(|p| Path::new(&p.path) != path);
    if report.unreadable.len() < 200 {
        report.unreadable.push(Unreadable {
            path: path.to_string_lossy().into(),
            reason: e.to_string(),
            permission: e.kind() == std::io::ErrorKind::PermissionDenied,
        });
    }
    for f in &mut report.all_files {
        if Path::new(&f.path).starts_with(path) {
            f.blocked = Some(format!("Leitura pendente: {}", path.display()));
        }
    }
}
#[derive(Serialize, Deserialize)]
pub struct ReconcileRequest {
    pub catalog: WorkerCatalog,
    pub paths: Vec<String>,
    pub full: bool,
    pub protection: Protection,
}
pub fn reconcile(
    mut report: CatalogReport,
    paths: &[String],
    full: bool,
    policy: Protection,
    cancel: &AtomicBool,
) -> Result<CatalogReport, String> {
    let started = Instant::now();
    let original_id = report.id.clone();
    let original_revision = report.revision;
    let created_at = report.created_at;
    if full {
        let groups = report.duplicates.clone();
        let compared = report.duplicates_checked;
        report = scan_incremental(
            ScanRequest {
                root: report.root.clone(),
                previous: report.inventory,
                protection: policy.clone(),
            },
            cancel,
            |_| {},
        )?;
        report.duplicates = groups;
        report.duplicates_checked = compared;
        rebuild(&mut report, &policy);
    } else {
        let root = PathBuf::from(&report.root);
        let mut work: Vec<PathBuf> = paths
            .iter()
            .map(PathBuf::from)
            .filter(|p| accepted_path(&root, p, &policy))
            .collect();
        work.sort();
        work.dedup();
        let mut visited_paths = HashSet::new();
        report.visited = 0;
        report.scanned_directories = 0;
        report.reused_directories = 0;
        while let Some(mut path) = work.pop() {
            if cancel.load(Ordering::Relaxed) {
                return Err("Sincronização interrompida".into());
            }
            // A new subtree may be announced only through one of its children.
            while let Some(parent) = path.parent() {
                if parent == root
                    || report
                        .nodes
                        .get(&parent.to_string_lossy().to_string())
                        .is_some_and(|n| n.directory)
                {
                    break;
                }
                if !parent.starts_with(&root) {
                    break;
                }
                path = parent.to_path_buf();
            }
            if !accepted_path(&root, &path, &policy) || !visited_paths.insert(path.clone()) {
                continue;
            }
            let meta = match fs::symlink_metadata(&path) {
                Ok(m) => m,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    forget(&mut report, &path);
                    if path == root {
                        add_issue(&mut report, &path, &e);
                        let key = path.to_string_lossy().to_string();
                        report.nodes.insert(
                            key.clone(),
                            Node {
                                path: key,
                                name: path
                                    .file_name()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .into(),
                                bytes: 0,
                                directory: true,
                                incomplete: true,
                            },
                        );
                    }
                    continue;
                }
                Err(e) => {
                    add_issue(&mut report, &path, &e);
                    continue;
                }
            };
            report.visited += 1;
            report
                .unreadable
                .retain(|u| !Path::new(&u.path).starts_with(&path));
            if report.visited + report.nodes.len() as u64 > 500_000 {
                report.incomplete = true;
                break;
            }
            if meta.file_type().is_symlink() || crate::engine::no_symlinks(&path).is_err() {
                forget(&mut report, &path);
                continue;
            }
            if meta.is_file() {
                upsert_file(&mut report, &path, &meta);
                continue;
            }
            if !meta.is_dir() {
                forget(&mut report, &path);
                continue;
            }
            let key = path.to_string_lossy().to_string();
            report.nodes.insert(
                key.clone(),
                Node {
                    path: key.clone(),
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into(),
                    bytes: 0,
                    directory: true,
                    incomplete: false,
                },
            );
            let entries = match fs::read_dir(&path).and_then(|r| {
                r.map(|e| e.map(|e| e.path()))
                    .collect::<Result<Vec<_>, _>>()
            }) {
                Ok(v) => v,
                Err(e) => {
                    add_issue(&mut report, &path, &e);
                    continue;
                }
            };
            report.scanned_directories += 1;
            let actual: HashSet<_> = entries.iter().cloned().collect();
            let gone: Vec<_> = report
                .nodes
                .keys()
                .map(PathBuf::from)
                .filter(|p| p.parent() == Some(&path) && !actual.contains(p))
                .collect();
            for p in gone {
                forget(&mut report, &p);
            }
            // Directory notifications are shallow. Only new/changed subdirectories are walked.
            for child in entries {
                if !accepted_path(&root, &child, &policy) {
                    continue;
                }
                match fs::symlink_metadata(&child) {
                    Ok(m) if m.file_type().is_symlink() => forget(&mut report, &child),
                    Ok(m) if m.is_dir() => {
                        let unchanged = report
                            .inventory
                            .get(&child.to_string_lossy().to_string())
                            .is_some_and(|old| old.revision == DirectoryRevision::read(&m));
                        if !unchanged {
                            work.push(child);
                        } else {
                            report.reused_directories += 1;
                        }
                    }
                    Ok(m) if m.is_file() => {
                        report.visited += 1;
                        upsert_file(&mut report, &child, &m);
                    }
                    Ok(_) => forget(&mut report, &child),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                        forget(&mut report, &child)
                    }
                    Err(e) => add_issue(&mut report, &child, &e),
                }
            }
            // Never bless a partial inventory as a complete scan: the next periodic pass relists it.
            report.inventory.remove(&key);
        }
        rebuild(&mut report, &policy);
    }
    report.id = original_id;
    report.created_at = created_at;
    report.revision = original_revision + 1;
    report.updated_at = now();
    report.cached = false;
    report.elapsed_ms = started.elapsed().as_millis() as u64;
    Ok(report)
}
pub fn reconcile_isolated(
    request_path: &Path,
    cancel: &AtomicBool,
) -> Result<CatalogReport, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let output = crate::native::run(
        &exe,
        &[
            "--folga-worker-reconcile".into(),
            request_path.to_string_lossy().into(),
        ],
        cancel,
        600,
    )?;
    let result: Result<WorkerCatalog, String> =
        serde_json::from_slice(&output).map_err(|e| format!("Resposta do índice inválida: {e}"))?;
    result.map(WorkerCatalog::into_report)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, CatalogReport) {
        let dir = tempfile::tempdir_in("/private/tmp").unwrap();
        fs::create_dir(dir.path().join("left")).unwrap();
        fs::create_dir(dir.path().join("right")).unwrap();
        fs::write(dir.path().join("left/a.bin"), vec![1u8; 1_048_576]).unwrap();
        fs::write(dir.path().join("right/b.bin"), vec![2u8; 1_048_576]).unwrap();
        let report = scan(
            dir.path().to_string_lossy().into(),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        (dir, report)
    }
    fn changed(report: CatalogReport, paths: &[PathBuf]) -> CatalogReport {
        reconcile(
            report,
            &paths
                .iter()
                .map(|p| p.to_string_lossy().into())
                .collect::<Vec<_>>(),
            false,
            Protection::default(),
            &AtomicBool::new(false),
        )
        .unwrap()
    }
    #[test]
    fn changed_file_updates_identity_and_totals_without_reading_unrelated_directory() {
        use std::os::unix::fs::PermissionsExt;
        let (dir, report) = fixture();
        let before = report
            .all_files
            .iter()
            .find(|f| f.name == "b.bin")
            .unwrap()
            .id
            .clone();
        let old = report
            .all_files
            .iter()
            .find(|f| f.name == "a.bin")
            .unwrap()
            .id
            .clone();
        let left = dir.path().join("left/a.bin");
        let right = dir.path().join("right");
        fs::write(&left, vec![3u8; 2_097_152]).unwrap();
        fs::set_permissions(&right, fs::Permissions::from_mode(0o000)).unwrap();
        let updated = changed(report, &[left]);
        fs::set_permissions(&right, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(updated.visited, 1);
        assert_eq!(updated.scanned_directories, 0);
        assert!(updated.unreadable.is_empty());
        assert!(updated.all_files.iter().any(|f| f.id == before));
        assert!(updated.all_files.iter().all(|f| f.id != old));
        assert_eq!(updated.bytes, 3_145_728);
        assert_eq!(updated.nodes[&updated.root].bytes, updated.bytes);
    }
    #[test]
    fn external_rename_addition_and_removal_persist_without_resurrecting_old_paths() {
        let (dir, report) = fixture();
        let old = dir.path().join("left/a.bin");
        let new = dir.path().join("left/renamed.bin");
        fs::rename(&old, &new).unwrap();
        let extra = dir.path().join("left/new.bin");
        fs::write(&extra, vec![3u8; 1_048_576]).unwrap();
        let updated = changed(report, &[old.clone(), new.clone(), extra]);
        let saved = serde_json::to_vec(&WorkerCatalog::from_report(updated)).unwrap();
        let reopened = serde_json::from_slice::<WorkerCatalog>(&saved)
            .unwrap()
            .into_report();
        assert!(!reopened
            .nodes
            .contains_key(&old.to_string_lossy().to_string()));
        assert_eq!(reopened.all_files.len(), 3);
        assert!(reopened.all_files.iter().any(|f| Path::new(&f.path) == new));
    }
    #[test]
    fn shallow_root_notification_does_not_revisit_unchanged_subtrees() {
        let (dir, report) = fixture();
        let new = dir.path().join("root.bin");
        fs::write(&new, vec![3u8; 1_048_576]).unwrap();
        let updated = changed(report, &[dir.path().into()]);
        assert_eq!(updated.reused_directories, 2);
        assert_eq!(updated.scanned_directories, 1);
        assert_eq!(updated.visited, 2);
        assert_eq!(updated.all_files.len(), 3);
    }
    #[test]
    fn missed_events_are_recovered_by_full_background_reconciliation() {
        let (dir, report) = fixture();
        let id = report.id.clone();
        let saved = serde_json::to_vec(&WorkerCatalog::from_report(report)).unwrap();
        let mut reopened = serde_json::from_slice::<WorkerCatalog>(&saved)
            .unwrap()
            .into_report();
        reopened.cached = true;
        fs::write(dir.path().join("left/a.bin"), vec![3u8; 3_145_728]).unwrap();
        let fresh = reconcile(
            reopened,
            &[],
            true,
            Protection::default(),
            &AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(fresh.id, id);
        assert!(!fresh.cached);
        assert_eq!(fresh.reused_directories, 3);
        assert_eq!(
            fresh
                .all_files
                .iter()
                .find(|f| f.name == "a.bin")
                .unwrap()
                .logical_bytes,
            3_145_728
        );
    }
    #[test]
    fn hardlink_accounting_reassigns_remaining_copy_after_deletion() {
        let (dir, _) = fixture();
        let original = dir.path().join("left/a.bin");
        let link = dir.path().join("left/link.bin");
        fs::hard_link(&original, &link).unwrap();
        let mut report = scan(
            dir.path().to_string_lossy().into(),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let before = report.bytes;
        fs::remove_file(&original).unwrap();
        remove_paths(
            &mut report,
            &[original.to_string_lossy().into()],
            &Protection::default(),
        );
        assert_eq!(report.bytes, before);
        assert!(report
            .all_files
            .iter()
            .any(|f| Path::new(&f.path) == link && f.bytes > 0));
    }
    #[test]
    fn missing_selection_does_not_block_cleanup_of_other_files() {
        let (dir, mut report) = fixture();
        let paths: Vec<_> = report.all_files.iter().map(|f| f.path.clone()).collect();
        let ids: Vec<_> = report.all_files.iter().map(|f| f.id.clone()).collect();
        fs::remove_file(&paths[0]).unwrap();
        let mut record =
            crate::catalog::trash(&mut report, ids, false, &AtomicBool::new(false)).unwrap();
        for item in &mut record.recovery {
            crate::native::restore(item).unwrap();
        }
        assert_eq!(record.removed.len(), 1);
        assert_eq!(record.skipped.len(), 1);
        let updated = reconcile(
            report,
            &paths,
            false,
            Protection::default(),
            &AtomicBool::new(false),
        )
        .unwrap();
        assert!(!updated.nodes.contains_key(&paths[0]));
        assert_eq!(updated.all_files.len(), 1); // The restored fixture is detected without a full scan.
        assert!(dir.path().exists());
    }
    #[test]
    fn protected_outside_and_symlink_scopes_are_not_followed() {
        let (dir, report) = fixture();
        let policy = Protection {
            paths: vec![dir.path().join("right").to_string_lossy().into()],
        };
        std::os::unix::fs::symlink("/etc", dir.path().join("link")).unwrap();
        let paths = vec![
            "/etc".into(),
            dir.path().join("link").to_string_lossy().into(),
            dir.path().join("right/b.bin").to_string_lossy().into(),
            format!("{}/../elsewhere", dir.path().display()),
        ];
        let updated = reconcile(report, &paths, false, policy, &AtomicBool::new(false)).unwrap();
        assert_eq!(updated.visited, 1); // The link itself was inspected, never its target.
        assert!(!updated.nodes.contains_key("/etc"));
        assert!(updated
            .all_files
            .iter()
            .find(|f| f.name == "b.bin")
            .unwrap()
            .blocked
            .is_some());
    }
    #[test]
    fn permission_failure_preserves_known_data_and_retry_restores_availability() {
        use std::os::unix::fs::PermissionsExt;
        if unsafe { libc::geteuid() } == 0 {
            return;
        }
        let (dir, report) = fixture();
        let denied = dir.path().join("left");
        fs::set_permissions(&denied, fs::Permissions::from_mode(0o000)).unwrap();
        let inaccessible = changed(report, &[denied.clone()]);
        fs::set_permissions(&denied, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(inaccessible.all_files.len(), 2);
        assert!(inaccessible
            .all_files
            .iter()
            .find(|f| f.name == "a.bin")
            .unwrap()
            .blocked
            .is_some());
        let retried = changed(inaccessible, &[denied]);
        assert!(retried
            .all_files
            .iter()
            .find(|f| f.name == "a.bin")
            .unwrap()
            .blocked
            .is_none());
    }
    #[test]
    fn same_size_change_with_restored_mtime_invalidates_old_selection() {
        let (dir, report) = fixture();
        let path = dir.path().join("left/a.bin");
        let original = report.all_files.iter().find(|f| f.name == "a.bin").unwrap();
        let before = fs::metadata(&path).unwrap().modified().unwrap();
        fs::write(&path, vec![9u8; 1_048_576]).unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(before))
            .unwrap();
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
        assert!(original
            .fingerprint
            .as_ref()
            .unwrap()
            .validate(&path)
            .is_err());
        let id = original.id.clone();
        let updated = changed(report, &[path]);
        assert!(updated.all_files.iter().all(|f| f.id != id));
    }
}
