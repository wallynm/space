//! Filesystem events are hints. Fingerprints remain authoritative at cleanup time.
use crate::{catalog_cache, AppState};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    collections::BTreeSet,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub watching: bool,
    pub refreshing: bool,
    pub phase: String,
    pub checked_at: u64,
    pub error: Option<String>,
}
#[derive(Default)]
struct Dirty {
    paths: BTreeSet<String>,
    full: bool,
    first: Option<Instant>,
    last: Option<Instant>,
}
impl Dirty {
    fn mark(&mut self, paths: &[String], full: bool) {
        self.first.get_or_insert_with(Instant::now);
        self.last = Some(Instant::now());
        self.full |= full;
        if !self.full {
            self.paths.extend(paths.iter().cloned());
            if self.paths.len() > 512 {
                self.full = true;
            }
        }
        if self.full {
            self.paths.clear();
        }
    }
    fn ready(&self) -> bool {
        self.last
            .is_some_and(|t| t.elapsed() >= Duration::from_secs(2))
            || self
                .first
                .is_some_and(|t| t.elapsed() >= Duration::from_secs(5))
    }
    fn take(&mut self) -> (Vec<String>, bool) {
        let paths = std::mem::take(&mut self.paths).into_iter().collect();
        let full = self.full;
        *self = Self::default();
        (paths, full)
    }
}
#[derive(Default)]
pub struct IndexState {
    pub status: Mutex<IndexStatus>,
    dirty: Mutex<Dirty>,
    pub cancel: AtomicBool,
}
impl IndexState {
    pub fn mark_paths(&self, paths: &[String]) {
        if let Ok(mut d) = self.dirty.lock() {
            d.mark(paths, false);
        }
    }
    pub fn mark_full(&self) {
        if let Ok(mut d) = self.dirty.lock() {
            if !d.full {
                d.mark(&[], true);
            }
        }
    }
}
#[tauri::command]
pub fn get_index_status(state: tauri::State<AppState>) -> IndexStatus {
    state
        .index
        .status
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default()
}
fn status(app: &tauri::AppHandle, update: impl FnOnce(&mut IndexStatus)) {
    if let Ok(mut s) = app.state::<AppState>().index.status.lock() {
        update(&mut s);
        let _ = app.emit("index-status", s.clone());
    }
}
fn consume_event(
    state: &IndexState,
    root: &Path,
    policy: &crate::policy::Protection,
    event: Event,
) {
    if event.need_rescan() {
        state.mark_full();
        return;
    }
    if matches!(event.kind, EventKind::Access(_)) {
        return;
    }
    let unknown_scope = event.paths.is_empty();
    let paths: Vec<_> = event
        .paths
        .into_iter()
        .filter(|p| catalog_cache::accepted_path(root, p, policy))
        .map(|p| p.to_string_lossy().into())
        .collect();
    if !paths.is_empty() {
        state.mark_paths(&paths);
    } else if matches!(event.kind, EventKind::Any | EventKind::Other) && unknown_scope {
        state.mark_full();
    }
}
fn replace_current(
    current: &mut Option<crate::catalog::CatalogReport>,
    updated: crate::catalog::CatalogReport,
    version: &(String, u64),
    busy: bool,
) -> bool {
    if busy
        || !current
            .as_ref()
            .is_some_and(|r| r.id == version.0 && r.revision == version.1)
    {
        return false;
    }
    *current = Some(updated);
    true
}
pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::sync_channel::<notify::Result<Event>>(512);
        let overflow = Arc::new(AtomicBool::new(false));
        let mut watcher: Option<notify::RecommendedWatcher> = None;
        let mut watched_root = String::new();
        let mut last_registration = Instant::now();
        let mut last_audit = Instant::now();
        let mut retry_after = Instant::now();
        loop {
            let state = app.state::<AppState>();
            if state.index.cancel.load(Ordering::Relaxed) {
                break;
            }
            let snapshot = state
                .catalog
                .lock()
                .ok()
                .and_then(|r| r.as_ref().map(|r| (r.root.clone(), r.cached)));
            let Some((root, cached)) = snapshot else {
                std::thread::sleep(Duration::from_secs(1));
                continue;
            };
            let policy = match crate::catalog_policy(&app) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let is_watching = state.index.status.lock().is_ok_and(|s| s.watching);
            let needs_registration = watched_root != root
                || (!is_watching && last_registration.elapsed() >= Duration::from_secs(30));
            if needs_registration {
                let root_changed = watched_root != root;
                watcher.take();
                let sender = tx.clone();
                let lost = overflow.clone();
                watcher = notify::recommended_watcher(move |event| {
                    if sender.try_send(event).is_err() {
                        lost.store(true, Ordering::SeqCst);
                    }
                })
                .ok();
                let mut watching = false;
                let mut error = None;
                if let Some(w) = watcher.as_mut() {
                    match w.watch(Path::new(&root), RecursiveMode::Recursive) {
                        Ok(()) => watching = true,
                        Err(e) => {
                            error = Some(format!(
                            "Monitor indisponível: {e}. A conferência periódica continua ativa."
                        ))
                        }
                    }
                    // Observe recreation of the selected root as well as deletion of its parent entry.
                    if let Some(parent) = Path::new(&root).parent() {
                        let _ = w.watch(parent, RecursiveMode::NonRecursive);
                    }
                } else {
                    error = Some("Monitor indisponível; conferência periódica ativa.".into());
                }
                status(&app, |s| {
                    s.watching = watching;
                    s.error = error;
                });
                watched_root = root.clone();
                last_registration = Instant::now();
                if root_changed && cached {
                    state.index.mark_full();
                }
                last_audit = Instant::now();
            }
            while let Ok(event) = rx.try_recv() {
                match event {
                    Ok(e) => consume_event(&state.index, Path::new(&root), &policy, e),
                    Err(e) => {
                        state.index.mark_full();
                        status(&app, |s| {
                            s.error =
                                Some(format!("Eventos incompletos: {e}. Reconciliando o índice."))
                        });
                    }
                }
            }
            if overflow.swap(false, Ordering::SeqCst)
                || last_audit.elapsed() >= Duration::from_secs(600)
            {
                state.index.mark_full();
            }
            let ready = state.index.dirty.lock().is_ok_and(|d| d.ready());
            if !ready || state.busy.load(Ordering::SeqCst) || Instant::now() < retry_after {
                std::thread::sleep(Duration::from_millis(500));
                continue;
            }
            let (paths, full) = state
                .index
                .dirty
                .lock()
                .map(|mut d| d.take())
                .unwrap_or_default();
            let report = state.catalog.lock().ok().and_then(|r| r.clone());
            let Some(report) = report else {
                continue;
            };
            let version = (report.id.clone(), report.revision);
            let request = catalog_cache::ReconcileRequest {
                catalog: crate::catalog::WorkerCatalog::from_report(report),
                paths: paths.clone(),
                full,
                protection: policy.clone(),
            };
            status(&app, |s| {
                s.refreshing = true;
                s.phase = if full {
                    "Conferindo índice em segundo plano"
                } else {
                    "Atualizando arquivos alterados"
                }
                .into();
            });
            let result = (|| {
                let request_path = crate::data_path(&app, "reconcile-request.json")?;
                crate::write_json(&request_path, &request)?;
                let result = catalog_cache::reconcile_isolated(&request_path, &state.index.cancel);
                let _ = std::fs::remove_file(request_path);
                result
            })();
            match result {
                Ok(updated) => {
                    let mut guard = state.catalog.lock().unwrap_or_else(|e| e.into_inner());
                    if crate::catalog_policy(&app).is_ok_and(|p| p.paths == policy.paths)
                        && replace_current(
                            &mut guard,
                            updated,
                            &version,
                            state.busy.load(Ordering::SeqCst),
                        )
                    {
                        crate::persist_catalog(&app, guard.as_ref().unwrap());
                        if full {
                            last_audit = Instant::now();
                        }
                        status(&app, |s| {
                            s.checked_at = crate::engine::now();
                            s.error = None;
                        });
                    } else if guard.as_ref().is_some_and(|r| r.id == version.0) {
                        // Never overwrite a cleanup or selection from a newer revision.
                        if full {
                            state.index.mark_full();
                        } else {
                            state.index.mark_paths(&paths);
                        }
                    }
                }
                Err(e) => {
                    status(&app, |s| {
                        s.error = Some(format!("Conferência pendente: {e}"))
                    });
                    if full {
                        state.index.mark_full();
                    } else {
                        state.index.mark_paths(&paths);
                    }
                    retry_after = Instant::now() + Duration::from_secs(60);
                }
            }
            status(&app, |s| {
                s.refreshing = false;
                s.phase.clear();
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    #[test]
    fn event_queue_bounds_memory_and_forces_audit_on_overflow() {
        let mut dirty = Dirty::default();
        dirty.mark(
            &(0..513).map(|i| format!("/data/{i}")).collect::<Vec<_>>(),
            false,
        );
        assert!(dirty.full);
        assert!(dirty.paths.is_empty());
        assert!(dirty.take().1);
        assert!(!dirty.ready());
    }
    #[test]
    fn rename_events_reconcile_both_paths_and_ignore_reads_and_outside_scopes() {
        let state = IndexState::default();
        let root = Path::new("/data");
        let policy = crate::policy::Protection {
            paths: vec!["/data/private".into()],
        };
        let event = Event::new(EventKind::Modify(notify::event::ModifyKind::Name(
            notify::event::RenameMode::Both,
        )))
        .add_path(PathBuf::from("/data/old.bin"))
        .add_path(PathBuf::from("/data/new.bin"));
        consume_event(&state, root, &policy, event);
        consume_event(
            &state,
            root,
            &policy,
            Event::new(EventKind::Access(notify::event::AccessKind::Read))
                .add_path(PathBuf::from("/data/read.bin")),
        );
        consume_event(
            &state,
            root,
            &policy,
            Event::new(EventKind::Any).add_path(PathBuf::from("/elsewhere")),
        );
        consume_event(
            &state,
            root,
            &policy,
            Event::new(EventKind::Any).add_path(PathBuf::from("/data/private/secret")),
        );
        let (paths, full) = state.dirty.lock().unwrap().take();
        assert_eq!(paths, vec!["/data/new.bin", "/data/old.bin"]);
        assert!(!full);
    }
    #[test]
    fn native_watcher_detects_real_file_changes_and_reconciles_only_that_file() {
        let dir = tempfile::tempdir_in("/private/tmp").unwrap();
        let path = dir.path().join("sample.bin");
        std::fs::write(&path, vec![1u8; 1_048_576]).unwrap();
        let report = crate::catalog::scan(
            dir.path().to_string_lossy().into(),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let before = report.all_files[0].id.clone();
        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(tx).unwrap();
        watcher.watch(dir.path(), RecursiveMode::Recursive).unwrap();
        std::fs::write(&path, vec![2u8; 2_097_152]).unwrap();
        let deadline = Instant::now() + Duration::from_secs(8);
        let state = IndexState::default();
        let policy = crate::policy::Protection::default();
        let mut received = false;
        while Instant::now() < deadline {
            if let Ok(Ok(event)) = rx.recv_timeout(Duration::from_millis(200)) {
                if event.paths.iter().any(|p| p == &path) {
                    received = true;
                }
                consume_event(&state, dir.path(), &policy, event);
                if received {
                    break;
                }
            }
        }
        assert!(
            received,
            "nenhum evento nativo recebido para o arquivo temporário"
        );
        let (paths, full) = state.dirty.lock().unwrap().take();
        let updated =
            catalog_cache::reconcile(report, &paths, full, policy, &AtomicBool::new(false))
                .unwrap();
        assert_eq!(updated.all_files[0].logical_bytes, 2_097_152);
        assert_ne!(updated.all_files[0].id, before);
        assert!(
            updated.visited <= 2,
            "visited={}, full={full}, paths={paths:?}",
            updated.visited
        );
    }
    #[test]
    fn delayed_background_scan_cannot_restore_a_removed_record() {
        let dir = tempfile::tempdir_in("/private/tmp").unwrap();
        let path = dir.path().join("sample.bin");
        std::fs::write(&path, vec![1u8; 1_048_576]).unwrap();
        let mut live = crate::catalog::scan(
            dir.path().to_string_lossy().into(),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        let version = (live.id.clone(), live.revision);
        let delayed = live.clone();
        catalog_cache::remove_paths(
            &mut live,
            &[path.to_string_lossy().into()],
            &crate::policy::Protection::default(),
        );
        let mut current = Some(live);
        assert!(!replace_current(&mut current, delayed, &version, false));
        assert!(current.as_ref().unwrap().all_files.is_empty());
        let version = (
            current.as_ref().unwrap().id.clone(),
            current.as_ref().unwrap().revision,
        );
        let next = current.as_ref().unwrap().clone();
        assert!(!replace_current(&mut current, next.clone(), &version, true));
        assert!(replace_current(&mut current, next, &version, false));
    }
}
