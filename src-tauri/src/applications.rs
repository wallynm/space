use crate::{
    engine::{now, stamp, CleanupRecord, Progress},
    native::{command, fresh, trash_path, Fingerprint},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppPart {
    pub id: String,
    pub path: String,
    pub bytes: Option<u64>,
    pub kind: String,
    pub blocked: Option<String>,
    #[serde(skip)]
    pub fingerprint: Option<Fingerprint>,
    #[serde(skip)]
    pub tree: (u64, u64, u64),
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub bundle_id: String,
    pub path: String,
    pub leftover: bool,
    pub parts: Vec<AppPart>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppReport {
    pub id: String,
    pub created_at: u64,
    pub apps: Vec<InstalledApp>,
    pub warnings: Vec<String>,
}
fn bundle(p: &Path) -> Option<(String, String)> {
    let v = plist::Value::from_file(p.join("Contents/Info.plist")).ok()?;
    let d = v.as_dictionary()?;
    let id = d.get("CFBundleIdentifier")?.as_string()?.to_string();
    let name = d
        .get("CFBundleDisplayName")
        .or_else(|| d.get("CFBundleName"))
        .and_then(|v| v.as_string())
        .unwrap_or_else(|| p.file_stem().and_then(|s| s.to_str()).unwrap_or("App"))
        .to_string();
    Some((id, name))
}
fn part(
    p: PathBuf,
    kind: &str,
    index: usize,
    cancel: &AtomicBool,
    include_containers: bool,
    policy: &crate::policy::Protection,
) -> Option<AppPart> {
    if !p.exists() {
        return None;
    }
    let protected = p
        .parent()
        .is_some_and(|parent| parent.ends_with("Library/Containers"));
    let result = if let Some(reason) = policy.reason(&p) {
        Err(reason)
    } else if protected && !include_containers {
        Err(
            "Container protegido; habilite a leitura opcional e autorize no macOS para medir"
                .into(),
        )
    } else {
        crate::native::measure_isolated(&p, cancel)
    };
    let fingerprint = Fingerprint::read(&p).ok();
    let blocked = if fingerprint.is_none() {
        Some("Link ou local inacessível; preservado".into())
    } else {
        result.as_ref().err().cloned()
    };
    let bytes = result.as_ref().ok().map(|v| v.0);
    let tree = result.unwrap_or_default();
    Some(AppPart {
        id: format!("part-{index}"),
        path: p.to_string_lossy().into(),
        bytes,
        kind: kind.into(),
        blocked,
        fingerprint,
        tree,
    })
}
fn associated(home: &Path, id: &str) -> Vec<(PathBuf, &'static str)> {
    vec![
        (home.join("Library/Caches").join(id), "cache"),
        (
            home.join("Library/Preferences").join(format!("{id}.plist")),
            "preferences",
        ),
        (home.join("Library/Application Support").join(id), "data"),
        (home.join("Library/Containers").join(id), "data"),
        (
            home.join("Library/Saved Application State")
                .join(format!("{id}.savedState")),
            "state",
        ),
    ]
}
fn plausible_id(s: &str) -> bool {
    s.split('.').count() >= 3
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
        && !s.starts_with("com.apple.")
        && s != "studio.journey.folga"
}
pub fn scan(
    include_containers: bool,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
) -> Result<AppReport, String> {
    scan_with_policy(
        include_containers,
        crate::policy::Protection::default(),
        cancel,
        progress,
    )
}
pub fn scan_with_policy(
    include_containers: bool,
    policy: crate::policy::Protection,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
) -> Result<AppReport, String> {
    let home = dirs::home_dir().ok_or("Pasta pessoal não encontrada")?;
    let mut report = AppReport {
        id: stamp(),
        created_at: now(),
        apps: vec![],
        warnings: vec![],
    };
    let mut installed = HashSet::new();
    let mut bundles = vec![];
    for root in [
        PathBuf::from("/Applications"),
        home.join("Applications"),
        PathBuf::from("/System/Applications"),
    ] {
        if !root.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&root)
            .max_depth(3)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                e.depth() == 0
                    || e.path()
                        .parent()
                        .is_none_or(|p| p.extension().is_none_or(|e| e != "app"))
            })
        {
            if cancel.load(Ordering::Relaxed) {
                return Err("Análise cancelada".into());
            }
            match entry {
                Ok(e)
                    if e.file_type().is_dir()
                        && e.path().extension().is_some_and(|s| s == "app") =>
                {
                    if let Some((id, name)) = bundle(e.path()) {
                        installed.insert(id.clone());
                        if !e.path().starts_with("/System") {
                            bundles.push((e.path().to_path_buf(), id, name))
                        }
                    }
                }
                Err(e) => report.warnings.push(e.to_string()),
                _ => {}
            }
        }
    }
    let mut index = 0;
    for (p, id, name) in bundles {
        if cancel.load(Ordering::Relaxed) {
            return Err("Análise cancelada".into());
        }
        progress(Progress {
            visited: report.apps.len() as u64,
            path: p.to_string_lossy().into(),
        });
        let mut parts = vec![];
        if let Some(item) = part(p.clone(), "app", index, cancel, include_containers, &policy) {
            parts.push(item);
            index += 1
        }
        for (p, k) in associated(&home, &id) {
            if let Some(item) = part(p, k, index, cancel, include_containers, &policy) {
                parts.push(item);
                index += 1
            }
        }
        report.apps.push(InstalledApp {
            id: format!("app-{}", report.apps.len()),
            name,
            bundle_id: id,
            path: p.to_string_lossy().into(),
            leftover: false,
            parts,
        });
    }
    // Only exact bundle identifiers are proposed. Shared group containers and name guesses are excluded.
    let mut residues = HashSet::new();
    for sub in [
        "Library/Caches",
        "Library/Application Support",
        "Library/Containers",
        "Library/Preferences",
    ] {
        if sub == "Library/Containers" && !include_containers {
            continue;
        }
        match crate::native::names_isolated(&home.join(sub), cancel) {
            Ok(entries) => {
                for entry in entries {
                    let name = entry.trim_end_matches(".plist").to_string();
                    if plausible_id(&name) && !installed.contains(&name) {
                        residues.insert(name);
                    }
                }
            }
            Err(e) => report.warnings.push(format!("{sub}: {e}")),
        }
    }
    for id in residues {
        if cancel.load(Ordering::Relaxed) {
            return Err("Análise cancelada".into());
        }
        let mut parts = vec![];
        for (p, k) in associated(&home, &id) {
            if let Some(item) = part(p, k, index, cancel, include_containers, &policy) {
                parts.push(item);
                index += 1
            }
        }
        if !parts.is_empty() {
            report.apps.push(InstalledApp {
                id: format!("app-{}", report.apps.len()),
                name: id.clone(),
                bundle_id: id,
                path: String::new(),
                leftover: true,
                parts,
            });
        }
    }
    report.apps.sort_by_key(|a| {
        std::cmp::Reverse(a.parts.iter().map(|p| p.bytes.unwrap_or(0)).sum::<u64>())
    });
    Ok(report)
}
pub fn trash(
    report: &AppReport,
    ids: Vec<String>,
    cancel: &AtomicBool,
) -> Result<CleanupRecord, String> {
    fresh(report.created_at)?;
    let ids: HashSet<_> = ids.into_iter().collect();
    let parts: Vec<_> = report
        .apps
        .iter()
        .flat_map(|a| a.parts.iter().map(move |p| (a, p)))
        .filter(|(_, p)| ids.contains(&p.id))
        .collect();
    if ids.is_empty() || ids.len() != parts.len() {
        return Err("Seleção inválida; analise novamente".into());
    }
    let processes =
        String::from_utf8_lossy(&command("/bin/ps", &["-axo", "comm,args"], cancel)?).to_string();
    for (a, p) in &parts {
        if p.blocked.is_some() {
            return Err("Um item selecionado está bloqueado".into());
        }
        if (!a.path.is_empty() && processes.contains(&format!("{}/", a.path)))
            || processes.contains(&a.bundle_id)
        {
            return Err(format!(
                "Feche {} antes de desinstalar ou limpar seus dados",
                a.name
            ));
        }
        p.fingerprint
            .as_ref()
            .ok_or("Identificação ausente")?
            .validate(Path::new(&p.path))?;
        if crate::native::measure_isolated(Path::new(&p.path), cancel)? != p.tree {
            return Err(format!(
                "Dados de {} foram alterados; analise novamente",
                a.name
            ));
        }
    }

    let mut r = CleanupRecord::new("trash-app");
    for (_, p) in parts {
        if cancel.load(Ordering::Relaxed) {
            r.skipped.push("Operação interrompida entre itens".into());
            break;
        }
        match p
            .fingerprint
            .as_ref()
            .unwrap()
            .validate(Path::new(&p.path))
            .and_then(|_| trash_path(Path::new(&p.path)))
        {
            Ok(recovery) => {
                r.recovery.push(recovery);
                r.removed.push(p.path.clone());
                r.removed_bytes += p.bytes.unwrap_or(0);
                r.moved_bytes += p.bytes.unwrap_or(0)
            }
            Err(e) => r.skipped.push(format!("{}: {e}", p.path)),
        }
    }
    r.freed_bytes = 0;
    Ok(r)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_bundle_ids_not_display_names() {
        assert!(plausible_id("com.vendor.editor"));
        assert!(!plausible_id("Editor"));
        assert!(!plausible_id("com.apple.photos"));
        assert!(!plausible_id("../com.vendor.editor"));
    }
    #[test]
    fn association_excludes_shared_data() {
        let paths = associated(Path::new("/Users/example"), "com.vendor.editor");
        assert!(paths
            .iter()
            .all(|(p, _)| !p.to_string_lossy().contains("Group Containers")));
        assert_eq!(paths.len(), 5);
    }
}
