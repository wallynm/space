use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub running: bool,
    pub label: String,
    pub started_at: u64,
    pub revision: u64,
    pub progress: Detail,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub visited: u64,
    pub path: String,
    pub bytes: u64,
    pub elapsed_ms: u64,
    pub scanned_directories: u64,
    pub reused_directories: u64,
    pub stage: String,
}
impl From<crate::engine::Progress> for Detail {
    fn from(p: crate::engine::Progress) -> Self {
        Self {
            visited: p.visited,
            path: p.path,
            stage: "Analisando".into(),
            ..Default::default()
        }
    }
}
pub fn progress(app: &tauri::AppHandle, mut p: Detail) {
    if let Ok(mut value) = app.state::<crate::AppState>().activity.lock() {
        if !value.running {
            return;
        }
        if p.elapsed_ms == 0 {
            p.elapsed_ms = crate::engine::now().saturating_sub(value.started_at) * 1000;
        }
        value.progress = p;
        value.revision += 1;
        let _ = app.emit("operation-changed", value.clone());
    }
}

// Release exactly once before announcing completion. A listener may start the next operation.
pub(crate) fn release(flag: &std::sync::atomic::AtomicBool, announce: impl FnOnce()) {
    flag.store(false, std::sync::atomic::Ordering::SeqCst);
    announce();
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    #[test]
    fn completion_never_releases_a_newly_started_operation() {
        let busy = AtomicBool::new(true);
        release(&busy, || {
            assert!(!busy.swap(true, Ordering::SeqCst));
        });
        assert!(busy.load(Ordering::SeqCst));
    }
}
