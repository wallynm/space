pub mod activity;
pub mod applications;
pub mod catalog;
pub mod catalog_cache;
pub mod docker;
pub mod engine;
mod index;
mod native;
pub mod policy;
pub mod system;
mod updates;
use engine::*;
use std::{
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
#[derive(Default)]
pub struct AppState {
    pub report: Mutex<Option<ScanReport>>,
    pub catalog: Mutex<Option<catalog::CatalogReport>>,
    pub applications: Mutex<Option<applications::AppReport>>,
    pub docker: Mutex<Option<docker::DockerReport>>,
    pub monitor: Mutex<system::MonitorData>,
    pub protection: Mutex<policy::Protection>,
    pub activity: Mutex<activity::Activity>,
    pub updates: Mutex<updates::UpdateState>,
    pub index: index::IndexState,
    pub cancel: AtomicBool,
    pub busy: AtomicBool,
}
pub(crate) struct BusyGuard<'a> {
    flag: &'a AtomicBool,
    app: tauri::AppHandle,
}
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        let state = self.app.state::<AppState>();
        if let Ok(mut activity) = state.activity.lock() {
            activity.running = false;
            activity.revision += 1;
            activity::release(self.flag, || {
                let _ = self.app.emit("operation-changed", activity.clone());
            });
        } else {
            activity::release(self.flag, || {});
        }
        let _ = self.app.emit("data-changed", ());
    }
}
pub(crate) fn acquire<'a>(
    state: &'a AppState,
    app: &tauri::AppHandle,
    label: &str,
) -> Result<BusyGuard<'a>, String> {
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("Uma operação já está em andamento".into());
    }
    state.cancel.store(false, Ordering::SeqCst);
    if let Ok(mut activity) = state.activity.lock() {
        let revision = activity.revision + 1;
        *activity = activity::Activity {
            id: stamp(),
            running: true,
            label: label.into(),
            started_at: now(),
            revision,
            progress: activity::Detail {
                stage: label.into(),
                ..Default::default()
            },
        };
        let _ = app.emit("operation-changed", activity.clone());
    }
    Ok(BusyGuard {
        flag: &state.busy,
        app: app.clone(),
    })
}
fn protection(state: &AppState) -> Result<policy::Protection, String> {
    state
        .protection
        .lock()
        .map(|p| p.clone())
        .map_err(|e| e.to_string())
}
fn catalog_policy(app: &tauri::AppHandle) -> Result<policy::Protection, String> {
    let mut policy = protection(&app.state::<AppState>())?;
    // Exclude our own changing index, avoiding recursive indexing of catalog.json.
    policy.paths.push(
        app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .into(),
    );
    Ok(policy)
}
fn persist_catalog(app: &tauri::AppHandle, report: &catalog::CatalogReport) {
    if let Err(e) = data_path(app, "catalog.json")
        .and_then(|path| write_json(&path, &catalog::WorkerCatalog::from_report(report.clone())))
    {
        let _ = app.emit(
            "history-error",
            format!("Índice atualizado; falha ao salvar catálogo: {e}"),
        );
    }
    let _ = app.emit("catalog-changed", report.summary());
}
fn persist_scan(app: &tauri::AppHandle, report: &ScanReport) {
    if let Err(e) = data_path(app, "scan.json")
        .and_then(|path| write_json(&path, &SavedScan::from_report(report.clone())))
    {
        let _ = app.emit(
            "history-error",
            format!("Caches atualizados; falha ao salvar índice: {e}"),
        );
    }
}
fn reconcile_removed(app: &tauri::AppHandle, removed: &[String]) {
    let state = app.state::<AppState>();
    if let Ok(mut catalog) = state.catalog.lock() {
        if let Some(r) = catalog.as_mut() {
            if let Ok(policy) = catalog_policy(app) {
                let revision = r.revision;
                catalog_cache::remove_paths(r, removed, &policy);
                if r.revision != revision {
                    persist_catalog(app, r);
                }
            }
        }
    }
    if let Ok(mut scan) = state.report.lock() {
        if let Some(r) = scan.as_mut() {
            retain_candidates(r, removed);
            persist_scan(app, r);
        }
    };
}
#[tauri::command]
fn get_disk_info() -> Result<DiskInfo, String> {
    disk_info()
}
#[tauri::command]
fn get_default_roots() -> Vec<String> {
    default_roots()
}
#[tauri::command]
fn cancel_operation(state: tauri::State<AppState>) {
    state.cancel.store(true, Ordering::SeqCst);
}
#[tauri::command]
async fn scan_disk(app: tauri::AppHandle, roots: Vec<String>) -> Result<ScanReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Analisando caches")?;
        let mut report = scan(roots, &state.cancel, |p| {
            activity::progress(&app, p.into());
        })?;
        let protection = protection(&state)?;
        for c in &mut report.candidates {
            if let Some(reason) = protection.reason(std::path::Path::new(&c.path)) {
                c.blocked = Some(reason);
            }
        }
        *state.report.lock().map_err(|e| e.to_string())? = Some(report.clone());
        persist_scan(&app, &report);
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn get_last_scan(state: tauri::State<AppState>) -> Option<ScanReport> {
    state.report.lock().ok()?.clone()
}
fn history_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("history.json"))
}
#[tauri::command]
fn get_history(app: tauri::AppHandle) -> Result<Vec<CleanupRecord>, String> {
    let path = history_path(&app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
#[tauri::command]
async fn clean_selected(
    app: tauri::AppHandle,
    scan_id: String,
    ids: Vec<String>,
    docker_confirmation: String,
) -> Result<CleanupRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Limpando caches")?;
        let report = state
            .report
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("Analise o disco antes de limpar")?;
        if report.id != scan_id {
            return Err("Análise substituída. Analise novamente.".into());
        }
        let policy = protection(&state)?;
        for c in report.candidates.iter().filter(|c| ids.contains(&c.id)) {
            policy.check(std::path::Path::new(&c.path))?;
        }
        let record = cleanup(&report, ids, docker_confirmation, &state.cancel, |p| {
            activity::progress(&app, p.into());
        })?;
        reconcile_removed(&app, &record.removed);
        let history_result = (|| {
            let mut history = get_history(app.clone())?;
            history.insert(0, record.clone());
            history.truncate(100);
            let path = history_path(&app)?;
            let temp = path.with_extension("tmp");
            fs::write(
                &temp,
                serde_json::to_vec_pretty(&history).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            fs::rename(temp, path).map_err(|e| e.to_string())
        })();
        if let Err(e) = history_result {
            let _ = app.emit(
                "history-error",
                format!("Limpeza executada; não foi possível salvar o histórico: {e}"),
            );
        }
        let _ = app.emit("disk-changed", ());
        Ok(record)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn analyze_folder(app: tauri::AppHandle, path: String) -> Result<Vec<FolderInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Analisando pasta")?;
        folder_map(path, &state.cancel, |p| {
            activity::progress(&app, p.into());
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn show_main(app: tauri::AppHandle, scan: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Janela não encontrada")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    if scan {
        let _ = app.emit_to("main", "request-scan", ());
    }
    Ok(())
}
#[tauri::command]
fn toggle_floating(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("floating")
        .ok_or("Monitor não encontrado")?;
    if window.is_visible().map_err(|e| e.to_string())? {
        window.hide().map_err(|e| e.to_string())
    } else {
        if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
            let scale = monitor.scale_factor();
            let width = monitor.size().width as f64 / scale;
            let height = monitor.size().height as f64 / scale;
            let origin = monitor.position();
            window
                .set_position(tauri::LogicalPosition::new(
                    origin.x as f64 / scale + (width - 370.).max(0.),
                    origin.y as f64 / scale + (height - 340.).max(30.),
                ))
                .map_err(|e| e.to_string())?;
        }
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())
    }
}
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let path = std::path::Path::new(&path);
    if !path.exists() {
        return Err("A pasta já não existe".into());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg("-R")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Abrir no Finder está disponível no macOS".into())
    }
}
fn save_record(app: &tauri::AppHandle, record: &CleanupRecord) {
    let result = (|| {
        let mut history = get_history(app.clone())?;
        history.insert(0, record.clone());
        history.truncate(100);
        write_json(&history_path(app)?, &history)
    })();
    if let Err(e) = result {
        let _ = app.emit(
            "history-error",
            format!("Operação executada; falha ao salvar histórico: {e}"),
        );
    }
    let _ = app.emit("disk-changed", ());
}
fn write_json<T: serde::Serialize>(path: &std::path::Path, value: &T) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temp, path).map_err(|e| e.to_string())
}
fn monitor_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("monitor.json"))
}
#[tauri::command]
fn get_catalog(state: tauri::State<AppState>) -> Option<catalog::CatalogReport> {
    state
        .catalog
        .lock()
        .ok()?
        .as_ref()
        .map(catalog::CatalogReport::summary)
}
#[tauri::command]
fn get_duplicates(state: tauri::State<AppState>) -> Option<Vec<catalog::DuplicateGroup>> {
    state
        .catalog
        .lock()
        .ok()?
        .as_ref()
        .filter(|r| r.duplicates_checked)
        .map(|r| r.duplicates.clone())
}
#[tauri::command]
async fn scan_catalog(
    app: tauri::AppHandle,
    path: String,
) -> Result<catalog::CatalogReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Atualizando mapa")?;
        let policy = catalog_policy(&app)?;
        let previous = state
            .catalog
            .lock()
            .map_err(|e| e.to_string())?
            .as_ref()
            .filter(|r| r.root == path)
            .map(|r| r.inventory.clone())
            .or_else(|| {
                let bytes = fs::read(data_path(&app, "catalog.json").ok()?).ok()?;
                let r = serde_json::from_slice::<catalog::WorkerCatalog>(&bytes)
                    .ok()?
                    .into_report();
                (r.root == path).then_some(r.inventory)
            })
            .unwrap_or_default();
        let request = catalog::ScanRequest {
            root: path,
            protection: policy,
            previous,
        };
        let request_path = data_path(&app, "catalog-request.json")?;
        write_json(&request_path, &request)?;
        let progress_app = app.clone();
        let result = catalog::scan_request_isolated(&request_path, &state.cancel, move |p| {
            activity::progress(&progress_app, p)
        });
        let _ = fs::remove_file(&request_path);
        let report = result?;
        if let Err(e) = write_json(
            &data_path(&app, "catalog.json")?,
            &catalog::WorkerCatalog::from_report(report.clone()),
        ) {
            let _ = app.emit(
                "history-error",
                format!("Análise concluída; falha ao salvar catálogo: {e}"),
            );
        }
        {
            let mut monitor = state.monitor.lock().map_err(|e| e.to_string())?;
            monitor.folders(&report);
            if let Err(e) = write_json(&monitor_path(&app)?, &*monitor) {
                let _ = app.emit(
                    "history-error",
                    format!("Análise concluída; falha ao salvar crescimento: {e}"),
                );
            }
        }
        let summary = report.summary();
        *state.catalog.lock().map_err(|e| e.to_string())? = Some(report);
        let _ = app.emit("monitor-changed", ());
        Ok(summary)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn catalog_children(
    state: tauri::State<AppState>,
    scan_id: String,
    path: String,
) -> Result<Vec<catalog::Node>, String> {
    let lock = state.catalog.lock().map_err(|e| e.to_string())?;
    let r = lock.as_ref().ok_or("Analise uma pasta primeiro")?;
    if r.id != scan_id {
        return Err("Análise substituída".into());
    }
    catalog::children(r, &path)
}
#[tauri::command]
async fn find_duplicates(
    app: tauri::AppHandle,
    scan_id: String,
) -> Result<Vec<catalog::DuplicateGroup>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Comparando duplicatas")?;
        let mut guard = state.catalog.lock().map_err(|e| e.to_string())?;
        let r = guard.as_mut().ok_or("Analise uma pasta primeiro")?;
        if r.id != scan_id {
            return Err("Análise substituída".into());
        }
        catalog::duplicates(r, &state.cancel, |p| {
            activity::progress(&app, p.into());
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn trash_files(
    app: tauri::AppHandle,
    scan_id: String,
    ids: Vec<String>,
    duplicate_mode: bool,
) -> Result<CleanupRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Enviando arquivos à Lixeira")?;
        let mut r = state
            .catalog
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("Analise antes de limpar")?;
        if r.id != scan_id {
            return Err("Análise substituída".into());
        }
        let policy = protection(&state)?;
        for f in r.all_files.iter().filter(|f| ids.contains(&f.id)) {
            policy.check(std::path::Path::new(&f.path))?;
        }
        let paths: Vec<String> = r
            .all_files
            .iter()
            .filter(|f| ids.contains(&f.id))
            .map(|f| f.path.clone())
            .collect();
        let record = catalog::trash(&mut r, ids, duplicate_mode, &state.cancel)?;
        // Only these selected paths need a check; an altered/missing item cannot block unrelated files.
        if let Ok(updated) = catalog_cache::reconcile(
            r.clone(),
            &paths,
            false,
            catalog_policy(&app)?,
            &AtomicBool::new(false),
        ) {
            r = updated;
        }
        {
            let mut guard = state.catalog.lock().map_err(|e| e.to_string())?;
            *guard = Some(r);
            persist_catalog(&app, guard.as_ref().unwrap());
        }
        reconcile_removed(&app, &record.removed);
        save_record(&app, &record);
        Ok(record)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn scan_applications(
    app: tauri::AppHandle,
    include_containers: bool,
) -> Result<applications::AppReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Analisando aplicativos")?;
        let r = applications::scan_with_policy(
            include_containers,
            protection(&state)?,
            &state.cancel,
            |p| {
                activity::progress(&app, p.into());
            },
        )?;
        *state.applications.lock().map_err(|e| e.to_string())? = Some(r.clone());
        Ok(r)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn trash_applications(
    app: tauri::AppHandle,
    scan_id: String,
    ids: Vec<String>,
) -> Result<CleanupRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Removendo itens de aplicativos")?;
        let r = state
            .applications
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("Analise os apps primeiro")?;
        if r.id != scan_id {
            return Err("Análise substituída".into());
        }
        let policy = protection(&state)?;
        for p in r
            .apps
            .iter()
            .flat_map(|a| &a.parts)
            .filter(|p| ids.contains(&p.id))
        {
            policy.check(std::path::Path::new(&p.path))?;
        }
        let record = applications::trash(&r, ids, &state.cancel)?;
        reconcile_removed(&app, &record.removed);
        *state.applications.lock().map_err(|e| e.to_string())? = None;
        save_record(&app, &record);
        Ok(record)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn scan_docker(app: tauri::AppHandle) -> Result<docker::DockerReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Analisando Docker")?;
        let mut r = docker::scan(&state.cancel)?;
        if let Some(reason) = protection(&state)?.docker_reason() {
            for i in &mut r.items {
                i.blocked = Some(reason.clone());
            }
        }
        *state.docker.lock().map_err(|e| e.to_string())? = Some(r.clone());
        Ok(r)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn clean_docker(
    app: tauri::AppHandle,
    scan_id: String,
    ids: Vec<String>,
    volume_confirmation: String,
) -> Result<CleanupRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Limpando recursos Docker")?;
        let r = state
            .docker
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("Analise Docker primeiro")?;
        if r.id != scan_id {
            return Err("Análise substituída".into());
        }
        if let Some(reason) = protection(&state)?.docker_reason() {
            return Err(reason);
        }
        let record = docker::clean(&r, ids, volume_confirmation, &state.cancel)?;
        *state.docker.lock().map_err(|e| e.to_string())? = None;
        save_record(&app, &record);
        Ok(record)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn diagnose_system(app: tauri::AppHandle) -> Result<system::SystemReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Lendo diagnóstico")?;
        system::diagnose(&state.cancel)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn get_monitor(state: tauri::State<AppState>) -> Result<system::MonitorView, String> {
    Ok(state.monitor.lock().map_err(|e| e.to_string())?.view())
}
#[tauri::command]
fn update_monitor(
    app: tauri::AppHandle,
    settings: system::MonitorSettings,
) -> Result<system::MonitorView, String> {
    if !(5..=40).contains(&settings.threshold) {
        return Err("Limite deve ficar entre 5% e 40%".into());
    }
    let state = app.state::<AppState>();
    let mut monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    let previous = monitor.settings.clone();
    monitor.settings = settings;
    if let Err(e) = write_json(&monitor_path(&app)?, &*monitor) {
        monitor.settings = previous;
        return Err(e);
    }
    let _ = app.emit("monitor-changed", ());
    Ok(monitor.view())
}
#[tauri::command]
fn quick_look(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.is_file() {
        return Err("Arquivo não encontrado".into());
    }
    std::process::Command::new("/usr/bin/qlmanage")
        .args(["-p", &path])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn open_trash() -> Result<(), String> {
    let p = dirs::home_dir()
        .ok_or("Pasta pessoal ausente")?
        .join(".Trash");
    let status = std::process::Command::new("/usr/bin/open")
        .arg(p)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Não foi possível abrir a Lixeira".into());
    }
    Ok(())
}
#[tauri::command]
async fn restore_trash(
    app: tauri::AppHandle,
    record_id: String,
    item_id: String,
) -> Result<Vec<CleanupRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _busy = acquire(&state, &app, "Restaurando arquivo")?;
        let mut history = get_history(app.clone())?;
        let record = history
            .iter_mut()
            .find(|r| r.id == record_id)
            .ok_or("Registro não encontrado")?;
        let item = record
            .recovery
            .iter_mut()
            .find(|r| r.id == item_id)
            .ok_or("Item de recuperação não encontrado")?;
        native::restore(item)?;
        state.index.mark_paths(&[item.original.clone()]);
        if let Err(e) = write_json(&history_path(&app)?, &history) {
            let _ = app.emit(
                "history-error",
                format!("Item recuperado; não foi possível atualizar o histórico: {e}"),
            );
        }
        let _ = app.emit("disk-changed", ());
        Ok(history)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn data_path(app: &tauri::AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}
fn load_saved(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(path) = data_path(app, "update-preferences.json") {
        if path.exists() {
            let enabled = fs::read(path)
                .ok()
                .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
                .and_then(|v| v.get("checkOnLaunch").and_then(|b| b.as_bool()))
                .unwrap_or(false);
            if let Ok(mut updates) = state.updates.lock() {
                updates.view.check_on_launch = enabled;
            }
        }
    }
    if let Ok(path) = data_path(app, "protection.json") {
        if path.exists() {
            let value = fs::read(&path)
                .ok()
                .and_then(|b| serde_json::from_slice::<policy::Protection>(&b).ok())
                .unwrap_or_else(|| policy::Protection {
                    paths: vec!["/".into()],
                });
            if let Ok(mut p) = state.protection.lock() {
                *p = value;
            }
        }
    }
    if let Ok(path) = data_path(app, "catalog.json") {
        if let Ok(bytes) = fs::read(path) {
            if let Ok(value) = serde_json::from_slice::<catalog::WorkerCatalog>(&bytes) {
                let mut report = value.into_report();
                report.cached = true;
                report.duplicates.clear();
                report.duplicates_checked = false;
                if let Ok(mut r) = state.catalog.lock() {
                    *r = Some(report);
                }
            }
        }
    }
    if let Ok(path) = data_path(app, "scan.json") {
        if let Some(mut report) = fs::read(path)
            .ok()
            .and_then(|b| serde_json::from_slice::<SavedScan>(&b).ok())
            .map(SavedScan::into_report)
        {
            retain_candidates(&mut report, &[]);
            if let Ok(mut r) = state.report.lock() {
                *r = Some(report);
            }
        }
    }
}
#[tauri::command]
fn get_operation(state: tauri::State<AppState>) -> Result<activity::Activity, String> {
    state
        .activity
        .lock()
        .map(|r| {
            let mut r = r.clone();
            if r.running {
                r.progress.elapsed_ms = r
                    .progress
                    .elapsed_ms
                    .max(now().saturating_sub(r.started_at) * 1000);
            }
            r
        })
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn get_protection(state: tauri::State<AppState>) -> Result<policy::Protection, String> {
    protection(&state)
}
#[tauri::command]
fn update_protection(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<policy::Protection, String> {
    let state = app.state::<AppState>();
    let _busy = acquire(&state, &app, "Atualizando pastas protegidas")?;
    let policy = policy::Protection::normalized(paths)?;
    write_json(&data_path(&app, "protection.json")?, &policy)?;
    *state.protection.lock().map_err(|e| e.to_string())? = policy.clone();
    *state.report.lock().map_err(|e| e.to_string())? = None;
    *state.applications.lock().map_err(|e| e.to_string())? = None;
    *state.docker.lock().map_err(|e| e.to_string())? = None;
    if let Some(r) = state.catalog.lock().map_err(|e| e.to_string())?.as_mut() {
        r.cached = true;
        r.revision += 1;
        r.duplicates.clear();
    }
    state.index.mark_full();
    Ok(policy)
}
#[tauri::command]
fn get_applications(state: tauri::State<AppState>) -> Option<applications::AppReport> {
    state.applications.lock().ok()?.clone()
}
#[tauri::command]
fn get_docker(state: tauri::State<AppState>) -> Option<docker::DockerReport> {
    state.docker.lock().ok()?.clone()
}
#[tauri::command]
fn open_privacy_settings() -> Result<(), String> {
    let status = std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Abra Ajustes do Sistema → Privacidade e Segurança → Acesso Total ao Disco".into())
    }
}
#[tauri::command]
async fn retry_unreadable(
    app: tauri::AppHandle,
    path: String,
) -> Result<catalog::CatalogReport, String> {
    let allowed = {
        let state = app.state::<AppState>();
        let report = state.catalog.lock().map_err(|e| e.to_string())?;
        report
            .as_ref()
            .is_some_and(|r| r.unreadable.iter().any(|p| p.path == path))
    };
    if !allowed {
        return Err("Pasta fora dos avisos da análise atual".into());
    }
    scan_catalog(app, path).await
}
fn start_monitor(app: tauri::AppHandle) {
    if let Ok(path) = monitor_path(&app) {
        match fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(data) => {
                    if let Ok(mut lock) = app.state::<AppState>().monitor.lock() {
                        *lock = data;
                    }
                }
                Err(e) => {
                    let _ = app.emit(
                        "history-error",
                        format!("Não foi possível ler monitor.json: {e}"),
                    );
                }
            },
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                let _ = app.emit(
                    "history-error",
                    format!("Não foi possível ler monitor.json: {e}"),
                );
            }
            _ => {}
        }
    }
    std::thread::spawn(move || loop {
        let state = app.state::<AppState>();
        if let Ok(mut data) = state.monitor.lock() {
            if data.settings.enabled {
                if let Ok(disk) = disk_info() {
                    let at = now();
                    if data
                        .samples
                        .last()
                        .is_none_or(|s| at.saturating_sub(s.at) >= 300)
                    {
                        data.samples.push(system::DiskSample {
                            at,
                            free: disk.free,
                            total: disk.total,
                        });
                        if data.samples.len() > 2016 {
                            data.samples.remove(0);
                        }
                        let low = disk.total > 0
                            && disk.free as f64 / (disk.total as f64) * 100.
                                < data.settings.threshold as f64;
                        if data.settings.notifications
                            && low
                            && at.saturating_sub(data.last_notification) >= 21600
                        {
                            use tauri_plugin_notification::NotificationExt;
                            if app
                                .notification()
                                .builder()
                                .title("Seu disco precisa de uma folga")
                                .body(format!(
                                    "{:.1} GB livres. Abra o Space para analisar.",
                                    disk.free as f64 / 1e9
                                ))
                                .show()
                                .is_ok()
                            {
                                data.last_notification = at;
                            }
                        }
                        if let Ok(path) = monitor_path(&app) {
                            if let Err(e) = write_json(&path, &*data) {
                                let _ = app
                                    .emit("history-error", format!("Falha ao salvar monitor: {e}"));
                            }
                        }
                        let _ = app.emit("monitor-changed", ());
                    }
                }
            }
        }
        drop(state);
        std::thread::sleep(std::time::Duration::from_secs(60));
    });
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_disk_info,
            get_default_roots,
            scan_disk,
            get_last_scan,
            cancel_operation,
            clean_selected,
            get_history,
            analyze_folder,
            show_main,
            toggle_floating,
            reveal_path,
            get_catalog,
            get_duplicates,
            index::get_index_status,
            scan_catalog,
            catalog_children,
            find_duplicates,
            trash_files,
            scan_applications,
            trash_applications,
            scan_docker,
            clean_docker,
            diagnose_system,
            get_monitor,
            update_monitor,
            quick_look,
            open_trash,
            restore_trash,
            get_operation,
            get_protection,
            update_protection,
            get_applications,
            get_docker,
            open_privacy_settings,
            retry_unreadable,
            updates::get_updates,
            updates::check_updates,
            updates::install_update,
            updates::restart_updated,
            updates::set_update_preferences
        ])
        .setup(|app| {
            load_saved(app.handle());
            index::start(app.handle().clone());
            start_monitor(app.handle().clone());
            let open = MenuItem::with_id(app, "open", "Abrir Space", true, None::<&str>)?;
            let floating =
                MenuItem::with_id(app, "floating", "Monitor flutuante", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Encerrar Space", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &floating, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Space · Espaço em disco")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        let _ = show_main(app.clone(), false);
                    }
                    "floating" => {
                        let _ = toggle_floating(app.clone());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let _ = toggle_floating(tray.app_handle().clone());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("Não foi possível iniciar o Space")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<AppState>()
                    .index
                    .cancel
                    .store(true, Ordering::SeqCst);
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = event
            {
                let _ = show_main(app.clone(), false);
            }
            let _ = app;
            let _ = event;
        });
}

/// Entry point for headless Rust workers, before initializing Tauri or WebKit.
pub fn worker_main() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return false;
    }
    let cancel = AtomicBool::new(false);
    let output = match args[1].as_str() {
        "--folga-worker-reconcile" => {
            let result = fs::read(&args[2])
                .map_err(|e| e.to_string())
                .and_then(|bytes| {
                    serde_json::from_slice::<catalog_cache::ReconcileRequest>(&bytes)
                        .map_err(|e| e.to_string())
                })
                .and_then(|r| {
                    catalog_cache::reconcile(
                        r.catalog.into_report(),
                        &r.paths,
                        r.full,
                        r.protection,
                        &cancel,
                    )
                });
            serde_json::to_vec(&result.map(catalog::WorkerCatalog::from_report))
        }
        "--folga-worker-names" => {
            serde_json::to_vec(&fs::read_dir(&args[2]).map_err(|e| e.to_string()).and_then(
                |entries| {
                    entries
                        .map(|entry| {
                            entry
                                .map(|e| e.file_name().to_string_lossy().to_string())
                                .map_err(|e| e.to_string())
                        })
                        .collect::<Result<Vec<_>, String>>()
                },
            ))
        }
        "--folga-worker-measure" => {
            serde_json::to_vec(&engine::measure(std::path::Path::new(&args[2]), &cancel))
        }
        "--folga-worker-catalog-incremental" => {
            let result = fs::read(&args[2])
                .map_err(|e| e.to_string())
                .and_then(|bytes| {
                    serde_json::from_slice::<catalog::ScanRequest>(&bytes)
                        .map_err(|e| e.to_string())
                })
                .and_then(|request| {
                    catalog::scan_incremental(request, &cancel, |p| {
                        if let Ok(line) = serde_json::to_string(&p) {
                            eprintln!("{line}");
                        }
                    })
                });
            serde_json::to_vec(&result.map(catalog::WorkerCatalog::from_report))
        }
        "--folga-worker-catalog" => serde_json::to_vec(
            &catalog::scan(args[2].clone(), &cancel, |_| {})
                .map(catalog::WorkerCatalog::from_report),
        ),
        _ => return false,
    };
    use std::io::Write;
    if let Ok(bytes) = output {
        let _ = std::io::stdout().write_all(&bytes);
    }
    true
}
