use crate::native::command;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::atomic::AtomicBool};
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub name: String,
    pub scope: String,
    pub purgeable: Option<bool>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemReport {
    pub volume: String,
    pub filesystem: String,
    pub container_bytes: Option<u64>,
    pub container_free: Option<u64>,
    pub data_bytes: Option<u64>,
    pub purgeable_bytes: Option<u64>,
    pub snapshots: Vec<Snapshot>,
    pub warnings: Vec<String>,
}
fn number(v: &plist::Value, key: &str) -> Option<u64> {
    v.as_dictionary()?.get(key)?.as_unsigned_integer()
}
pub fn diagnose(cancel: &AtomicBool) -> Result<SystemReport, String> {
    if !cfg!(target_os = "macos") {
        return Err("Diagnóstico APFS disponível no macOS".into());
    }
    let data = command(
        "/usr/sbin/diskutil",
        &["info", "-plist", "/System/Volumes/Data"],
        cancel,
    )?;
    let info = plist::Value::from_reader_xml(data.as_slice()).map_err(|e| e.to_string())?;
    let dict = info.as_dictionary().ok_or("Resposta inválida do macOS")?;
    let mut r = SystemReport {
        volume: dict
            .get("VolumeName")
            .and_then(|v| v.as_string())
            .unwrap_or("Data")
            .into(),
        filesystem: dict
            .get("FilesystemType")
            .and_then(|v| v.as_string())
            .unwrap_or("Desconhecido")
            .into(),
        container_bytes: number(&info, "APFSContainerSize"),
        container_free: number(&info, "APFSContainerFree"),
        data_bytes: number(&info, "CapacityInUse"),
        purgeable_bytes: number(&info, "PurgeableSpace"),
        snapshots: vec![],
        warnings: vec![],
    };
    for (scope, label) in [("/System/Volumes/Data", "Dados"), ("/", "Sistema")] {
        match command(
            "/usr/sbin/diskutil",
            &["apfs", "listSnapshots", scope, "-plist"],
            cancel,
        )
        .and_then(|bytes| {
            plist::Value::from_reader_xml(bytes.as_slice()).map_err(|e| e.to_string())
        }) {
            Ok(v) => {
                if let Some(items) = v
                    .as_dictionary()
                    .and_then(|d| d.get("Snapshots"))
                    .and_then(|v| v.as_array())
                {
                    for s in items {
                        if let Some(d) = s.as_dictionary() {
                            r.snapshots.push(Snapshot {
                                name: d
                                    .get("Name")
                                    .or_else(|| d.get("SnapshotName"))
                                    .and_then(|v| v.as_string())
                                    .unwrap_or("Snapshot APFS")
                                    .into(),
                                scope: label.into(),
                                purgeable: d.get("Purgeable").and_then(|v| v.as_boolean()),
                            })
                        }
                    }
                }
            }
            Err(e) => r.warnings.push(format!("Snapshots de {label}: {e}")),
        }
    }
    Ok(r)
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSettings {
    pub enabled: bool,
    pub notifications: bool,
    pub threshold: u8,
}
impl Default for MonitorSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            notifications: false,
            threshold: 15,
        }
    }
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiskSample {
    pub at: u64,
    pub free: u64,
    pub total: u64,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderSample {
    pub root: String,
    pub path: String,
    pub bytes: u64,
    pub at: u64,
    pub complete: bool,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Growth {
    pub path: String,
    pub bytes: u64,
    pub delta: Option<i64>,
    pub previous_at: Option<u64>,
    pub at: u64,
    pub complete: bool,
}
#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MonitorData {
    pub settings: MonitorSettings,
    pub samples: Vec<DiskSample>,
    pub folders: Vec<FolderSample>,
    #[serde(default)]
    pub last_notification: u64,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MonitorView {
    pub settings: MonitorSettings,
    pub samples: Vec<DiskSample>,
    pub growth: Vec<Growth>,
}
impl MonitorData {
    pub fn view(&self) -> MonitorView {
        let mut groups: HashMap<(&str, &str), Vec<&FolderSample>> = HashMap::new();
        for f in &self.folders {
            groups.entry((&f.root, &f.path)).or_default().push(f)
        }
        let mut growth = vec![];
        for mut samples in groups.into_values() {
            samples.sort_by_key(|s| std::cmp::Reverse(s.at));
            let latest = samples[0];
            let previous = samples
                .iter()
                .skip(1)
                .find(|p| p.complete && p.at < latest.at);
            growth.push(Growth {
                path: latest.path.clone(),
                bytes: latest.bytes,
                delta: if latest.complete {
                    previous.map(|p| latest.bytes as i64 - p.bytes as i64)
                } else {
                    None
                },
                previous_at: previous.map(|p| p.at),
                at: latest.at,
                complete: latest.complete,
            })
        }
        growth.sort_by_key(|g| std::cmp::Reverse(g.delta.unwrap_or(0)));
        MonitorView {
            settings: self.settings.clone(),
            samples: self.samples.clone(),
            growth,
        }
    }
    pub fn folders(&mut self, report: &crate::catalog::CatalogReport) {
        let at = crate::engine::now();
        let mut samples = vec![FolderSample {
            root: report.root.clone(),
            path: report.root.clone(),
            bytes: report.bytes,
            at,
            complete: !report.incomplete,
        }];
        if let Ok(children) = crate::catalog::children(report, &report.root) {
            samples.extend(
                children
                    .into_iter()
                    .filter(|n| n.directory)
                    .map(|n| FolderSample {
                        root: report.root.clone(),
                        path: n.path,
                        bytes: n.bytes,
                        at,
                        complete: !n.incomplete,
                    }),
            );
        }
        self.folders.extend(samples);
        if self.folders.len() > 10_000 {
            self.folders.drain(..self.folders.len() - 10_000);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_scan_never_reports_shrinkage() {
        let d = MonitorData {
            folders: vec![
                FolderSample {
                    root: "r".into(),
                    path: "p".into(),
                    bytes: 500,
                    at: 1,
                    complete: true,
                },
                FolderSample {
                    root: "r".into(),
                    path: "p".into(),
                    bytes: 20,
                    at: 2,
                    complete: false,
                },
            ],
            ..Default::default()
        };
        assert_eq!(d.view().growth[0].delta, None);
    }
    #[test]
    fn compares_two_complete_scans() {
        let d = MonitorData {
            folders: vec![
                FolderSample {
                    root: "r".into(),
                    path: "p".into(),
                    bytes: 500,
                    at: 1,
                    complete: true,
                },
                FolderSample {
                    root: "r".into(),
                    path: "p".into(),
                    bytes: 700,
                    at: 2,
                    complete: true,
                },
            ],
            ..Default::default()
        };
        assert_eq!(d.view().growth[0].delta, Some(200));
    }
}
