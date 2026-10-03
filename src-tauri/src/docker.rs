use crate::{
    engine::{now, stamp, CleanupRecord},
    native::{fresh, run},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DockerItem {
    pub id: String,
    pub resource_id: String,
    pub name: String,
    pub kind: String,
    pub bytes: Option<u64>,
    pub blocked: Option<String>,
    pub shared: bool,
    pub detail: String,
    #[serde(skip)]
    pub signature: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DockerReport {
    pub id: String,
    pub created_at: u64,
    pub context: String,
    pub endpoint: String,
    pub builder: Option<String>,
    pub items: Vec<DockerItem>,
    pub warnings: Vec<String>,
    #[serde(skip)]
    pub binary: PathBuf,
}
trait Runner {
    fn call(&self, args: &[String]) -> Result<Vec<u8>, String>;
}
struct Cli<'a> {
    binary: &'a Path,
    cancel: &'a AtomicBool,
}
impl Runner for Cli<'_> {
    fn call(&self, args: &[String]) -> Result<Vec<u8>, String> {
        run(self.binary, args, self.cancel, 90)
    }
}
fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or("").into()
}
fn call(r: &impl Runner, args: &[&str]) -> Result<Vec<u8>, String> {
    r.call(&args.iter().map(|s| s.to_string()).collect::<Vec<_>>())
}
fn local(endpoint: &str) -> Result<(), String> {
    if endpoint.starts_with("unix:///") && endpoint.len() > 8 {
        Ok(())
    } else {
        Err(
            "Somente Docker local via socket Unix é aceito. Contextos remotos foram preservados."
                .into(),
        )
    }
}
fn context(r: &impl Runner, name: &str) -> Result<String, String> {
    let v: Value = serde_json::from_slice(&call(r, &["context", "inspect", name])?)
        .map_err(|e| e.to_string())?;
    let endpoint = v
        .pointer("/0/Endpoints/docker/Host")
        .and_then(Value::as_str)
        .ok_or("Endpoint Docker ausente")?;
    local(endpoint)?;
    Ok(endpoint.into())
}
fn docker(r: &impl Runner, endpoint: &str, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut full = vec!["--host".to_string(), endpoint.into()];
    full.extend(args.iter().map(|s| s.to_string()));
    r.call(&full)
}
fn json_lines(bytes: &[u8]) -> Result<Vec<Value>, String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).map_err(|e| format!("JSON Docker inválido: {e}")))
        .collect()
}
fn human_size(v: &str) -> Option<u64> {
    let split = v.find(|c: char| c.is_ascii_alphabetic())?;
    let n = v[..split].trim().parse::<f64>().ok()?;
    let multiplier = match v[split..].trim() {
        "B" | "b" => 1.,
        "kB" | "KB" | "kb" => 1e3,
        "MB" | "mb" => 1e6,
        "GB" | "gb" => 1e9,
        "TB" | "tb" => 1e12,
        "KiB" | "kib" | "KIB" => 1024.,
        "MiB" | "mib" | "MIB" => 1024. * 1024.,
        "GiB" | "gib" | "GIB" => 1024. * 1024. * 1024.,
        "TiB" | "tib" | "TIB" => 1024. * 1024. * 1024. * 1024.,
        _ => return None,
    };
    Some((n * multiplier) as u64)
}
fn snapshot(r: &impl Runner, binary: PathBuf) -> Result<DockerReport, String> {
    let current = String::from_utf8(call(r, &["context", "show"])?)
        .map_err(|e| e.to_string())?
        .trim()
        .to_string();
    let endpoint = context(r, &current)?;
    let mut report = DockerReport {
        id: stamp(),
        created_at: now(),
        context: current,
        endpoint: endpoint.clone(),
        builder: None,
        items: vec![],
        warnings: vec![],
        binary,
    };
    let container_ids = String::from_utf8(docker(
        r,
        &endpoint,
        &["container", "ls", "--all", "--quiet", "--no-trunc"],
    )?)
    .map_err(|e| e.to_string())?
    .split_whitespace()
    .map(str::to_string)
    .collect::<Vec<_>>();
    let mut used_images = HashSet::new();
    let mut used_volumes = HashSet::new();
    for chunk in container_ids.chunks(100) {
        let mut args = vec!["container", "inspect", "--size"];
        args.extend(chunk.iter().map(String::as_str));
        let containers: Vec<Value> =
            serde_json::from_slice(&docker(r, &endpoint, &args)?).map_err(|e| e.to_string())?;
        for v in containers {
            let id = s(&v, "Id");
            let running = v
                .pointer("/State/Running")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            used_images.insert(s(&v, "Image"));
            if let Some(mounts) = v.get("Mounts").and_then(Value::as_array) {
                for m in mounts {
                    if s(m, "Type") == "volume" {
                        used_volumes.insert(s(m, "Name"));
                    }
                }
            }
            let signature = format!("{}:{}:{}", s(&v, "Created"), s(&v, "Image"), running);
            report.items.push(DockerItem {
                id: format!("container:{id}"),
                resource_id: id,
                name: s(&v, "Name").trim_start_matches('/').into(),
                kind: "container".into(),
                bytes: v.get("SizeRw").and_then(Value::as_u64),
                blocked: if running {
                    Some("Container em execução".into())
                } else {
                    None
                },
                shared: false,
                detail: if running {
                    "Em execução"
                } else {
                    "Parado · remove a camada gravável, preserva volumes"
                }
                .into(),
                signature,
            });
        }
    }
    let images = json_lines(&docker(
        r,
        &endpoint,
        &["image", "ls", "--all", "--no-trunc", "--format", "json"],
    )?)?;
    let mut seen = HashMap::<String, usize>::new();
    for v in images {
        let id = s(&v, "ID");
        let tag = format!("{}:{}", s(&v, "Repository"), s(&v, "Tag"));
        if let Some(index) = seen.get(&id) {
            report.items[*index].name.push_str(&format!(", {tag}"));
            continue;
        }
        seen.insert(id.clone(), report.items.len());
        report.items.push(DockerItem {
            id: format!("image:{id}"),
            resource_id: id.clone(),
            name: tag,
            kind: "image".into(),
            bytes: human_size(&s(&v, "Size")),
            blocked: if used_images.contains(&id) {
                Some("Usada por um container, inclusive parado".into())
            } else {
                None
            },
            shared: true,
            detail: "Pode compartilhar camadas. Espaço não é somável.".into(),
            signature: id,
        });
    }
    let volumes = json_lines(&docker(
        r,
        &endpoint,
        &["volume", "ls", "--format", "json"],
    )?)?;
    for v in volumes {
        let name = s(&v, "Name");
        let detail: Vec<Value> =
            serde_json::from_slice(&docker(r, &endpoint, &["volume", "inspect", &name])?)
                .map_err(|e| e.to_string())?;
        let signature = detail
            .first()
            .map(|v| {
                format!(
                    "{}:{}:{}",
                    s(v, "CreatedAt"),
                    s(v, "Driver"),
                    v.get("Options").unwrap_or(&Value::Null)
                )
            })
            .unwrap_or_default();
        report.items.push(DockerItem {
            id: format!("volume:{name}"),
            resource_id: name.clone(),
            name: name.clone(),
            kind: "volume".into(),
            bytes: None,
            blocked: if used_volumes.contains(&name) {
                Some("Vinculado a um container; preservado".into())
            } else {
                None
            },
            shared: false,
            detail: "Dados persistentes. Pode conter bancos de dados. Tamanho não informado."
                .into(),
            signature,
        });
    }
    // Inspect does not bootstrap/start builders. Reject remote or mixed-node builders.
    let cache = (|| -> Result<(), String> {
        let text = String::from_utf8(docker(r, &endpoint, &["buildx", "inspect"])?)
            .map_err(|e| e.to_string())?;
        let builder = text
            .lines()
            .find_map(|l| l.strip_prefix("Name:").map(str::trim))
            .ok_or("Builder não identificado")?
            .to_string();
        let driver = text
            .lines()
            .find_map(|l| l.strip_prefix("Driver:").map(str::trim))
            .unwrap_or("");
        if !["docker", "docker-container"].contains(&driver) {
            return Err("Builder remoto ou não suportado; cache preservado".into());
        }
        let endpoints: Vec<_> = text
            .lines()
            .filter_map(|l| l.trim().strip_prefix("Endpoint:").map(str::trim))
            .collect();
        if endpoints.is_empty() {
            return Err("Endpoints do builder não identificados".into());
        }
        for ep in endpoints {
            if ep.starts_with("unix://") {
                local(ep)?;
            } else {
                context(r, ep)?;
            }
        }
        let entries = json_lines(&docker(
            r,
            &endpoint,
            &["buildx", "--builder", &builder, "du", "--format=json"],
        )?)?;
        report.builder = Some(builder);
        for v in entries {
            let id = s(&v, "ID");
            let reclaim = v
                .get("Reclaimable")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let bytes = v
                .get("Size")
                .and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok()));
            let shared = v.get("Shared").and_then(Value::as_bool).unwrap_or(true);
            report.items.push(DockerItem {
                id: format!("cache:{id}"),
                resource_id: id.clone(),
                name: s(&v, "Description"),
                kind: "cache".into(),
                bytes,
                blocked: if reclaim {
                    None
                } else {
                    Some("Cache em uso ou não recuperável".into())
                },
                shared,
                detail: if shared {
                    "Compartilha dados com imagens; recuperação pode ser menor"
                } else {
                    "Cache de build; próximos builds podem demorar mais"
                }
                .into(),
                signature: format!("{}:{}:{}", id, s(&v, "LastUsedAt"), bytes.unwrap_or(0)),
            });
        }
        Ok(())
    })();
    if let Err(e) = cache {
        report
            .warnings
            .push(format!("Cache de build indisponível: {e}"));
    }
    report
        .items
        .sort_by_key(|i| std::cmp::Reverse(i.bytes.unwrap_or(0)));
    Ok(report)
}
pub fn scan(cancel: &AtomicBool) -> Result<DockerReport, String> {
    let home = dirs::home_dir().ok_or("Pasta pessoal ausente")?;
    let binary = [
        PathBuf::from("/usr/local/bin/docker"),
        PathBuf::from("/opt/homebrew/bin/docker"),
        home.join(".docker/bin/docker"),
        PathBuf::from("/Applications/Docker.app/Contents/Resources/bin/docker"),
        PathBuf::from("/Applications/OrbStack.app/Contents/MacOS/xbin/docker"),
    ]
    .into_iter()
    .find(|p| p.is_file())
    .ok_or("Docker CLI não encontrado. Instale ou abra Docker/OrbStack para usar esta análise.")?;
    snapshot(
        &Cli {
            binary: &binary,
            cancel,
        },
        binary.clone(),
    )
}
fn removal(item: &DockerItem, builder: Option<&str>) -> Result<Vec<String>, String> {
    let args = match item.kind.as_str() {
        "container" => vec![
            "container".into(),
            "rm".into(),
            "--".into(),
            item.resource_id.clone(),
        ],
        "image" => vec![
            "image".into(),
            "rm".into(),
            "--".into(),
            item.resource_id.clone(),
        ],
        "volume" => vec![
            "volume".into(),
            "rm".into(),
            "--".into(),
            item.resource_id.clone(),
        ],
        "cache" => vec![
            "buildx".into(),
            "--builder".into(),
            builder.ok_or("Builder ausente")?.into(),
            "prune".into(),
            "--force".into(),
            "--filter".into(),
            format!("id={}", item.resource_id),
        ],
        _ => return Err("Tipo Docker inválido".into()),
    };
    Ok(args)
}
fn validate<'a>(
    old: &'a DockerReport,
    current: &DockerReport,
    ids: &[String],
    phrase: &str,
) -> Result<Vec<&'a DockerItem>, String> {
    fresh(old.created_at)?;
    if old.endpoint != current.endpoint
        || old.context != current.context
        || old.builder != current.builder
    {
        return Err("Contexto ou builder mudou; analise novamente".into());
    }
    let ids: HashSet<_> = ids.iter().collect();
    let selected: Vec<_> = old.items.iter().filter(|i| ids.contains(&i.id)).collect();
    if selected.is_empty() || selected.len() != ids.len() {
        return Err("Seleção Docker inválida".into());
    }
    for i in &selected {
        let live = current
            .items
            .iter()
            .find(|j| i.id == j.id)
            .ok_or("Item Docker já não existe")?;
        if live.blocked.is_some() || i.signature != live.signature {
            return Err(format!(
                "{} mudou ou está em uso; analise novamente",
                i.name
            ));
        }
        if i.kind == "volume" && phrase != "APAGAR VOLUMES" {
            return Err("Confirme APAGAR VOLUMES para remover dados persistentes".into());
        }
    }
    Ok(selected)
}
pub fn clean(
    old: &DockerReport,
    ids: Vec<String>,
    phrase: String,
    cancel: &AtomicBool,
) -> Result<CleanupRecord, String> {
    let cli = Cli {
        binary: &old.binary,
        cancel,
    };
    let current = snapshot(&cli, old.binary.clone())?;
    let selected = validate(old, &current, &ids, &phrase)?;
    let before = crate::engine::disk_info()?.free;
    let mut record = CleanupRecord::new("docker");
    for item in selected {
        if cancel.load(Ordering::Relaxed) {
            record
                .skipped
                .push("Operação interrompida entre itens Docker".into());
            break;
        }
        let latest = snapshot(&cli, old.binary.clone())?;
        if let Err(e) = validate(old, &latest, std::slice::from_ref(&item.id), &phrase) {
            record.skipped.push(e);
            continue;
        }
        let mut args = vec!["--host".to_string(), old.endpoint.clone()];
        args.extend(removal(item, old.builder.as_deref())?);
        match cli.call(&args) {
            Ok(_) => {
                record
                    .removed
                    .push(format!("Docker {} · {}", item.kind, item.name));
                record.removed_bytes += item.bytes.unwrap_or(0)
            }
            Err(e) => record.skipped.push(format!("{}: {e}", item.name)),
        }
    }
    record.freed_bytes = crate::engine::disk_info()?.free.saturating_sub(before);
    Ok(record)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn item(kind: &str) -> DockerItem {
        DockerItem {
            id: "v".into(),
            resource_id: "real-id".into(),
            kind: kind.into(),
            name: "db".into(),
            bytes: Some(1),
            blocked: None,
            shared: false,
            detail: String::new(),
            signature: "same".into(),
        }
    }
    fn report(kind: &str) -> DockerReport {
        DockerReport {
            id: "s".into(),
            created_at: now(),
            context: "local".into(),
            endpoint: "unix:///tmp/socket".into(),
            builder: Some("local".into()),
            items: vec![item(kind)],
            warnings: vec![],
            binary: PathBuf::new(),
        }
    }
    #[test]
    fn rejects_remote_daemons() {
        assert!(local("ssh://host").is_err());
        assert!(local("tcp://host:2375").is_err());
        assert!(local("unix:///tmp/sock").is_ok())
    }
    #[test]
    fn parses_decimal_and_binary_human_sizes() {
        assert_eq!(human_size("500B"), Some(500));
        assert_eq!(human_size("10kB"), Some(10_000));
        assert_eq!(human_size("500MB"), Some(500_000_000));
        assert_eq!(human_size("1.5GB"), Some(1_500_000_000));
        assert_eq!(human_size("2TB"), Some(2_000_000_000_000));
        assert_eq!(human_size("10KiB"), Some(10 * 1024));
        assert_eq!(human_size("12.5MiB"), Some((12.5 * 1024. * 1024.) as u64));
        assert_eq!(human_size("1.5GiB"), Some((1.5 * 1024. * 1024. * 1024.) as u64));
        assert_eq!(human_size("1TiB"), Some(1024 * 1024 * 1024 * 1024));
        assert_eq!(human_size("invalid"), None);
    }
    #[test]
    fn removals_target_only_selected_resource() {
        let c = removal(&item("container"), None).unwrap();
        assert!(!c.contains(&"--force".into()));
        assert!(!c.contains(&"--volumes".into()));
        assert_eq!(c.last().unwrap(), "real-id");
        let c = removal(&item("cache"), Some("local")).unwrap();
        assert_eq!(c.last().unwrap(), "id=real-id");
        assert!(!c.contains(&"--all".into()))
    }
    #[test]
    fn volumes_require_explicit_phrase() {
        let r = report("volume");
        assert!(validate(&r, &r, &["v".into()], "").is_err());
        assert!(validate(&r, &r, &["v".into()], "APAGAR VOLUMES").is_ok())
    }
    #[test]
    fn state_changes_block_removal() {
        let old = report("container");
        let mut current = old.clone();
        current.items[0].blocked = Some("Em execução".into());
        assert!(validate(&old, &current, &["v".into()], "").is_err());
        current = old.clone();
        current.endpoint = "unix:///other".into();
        assert!(validate(&old, &current, &["v".into()], "").is_err())
    }
}
#[cfg(test)]
mod integration_tests {
    use super::*;
    struct Fake;
    impl Runner for Fake {
        fn call(&self, args: &[String]) -> Result<Vec<u8>, String> {
            let a = args.iter().map(String::as_str).collect::<Vec<_>>();
            let body=match a.as_slice(){
["context","show"]=>"desktop-linux",
["context","inspect","desktop-linux"]=>r#"[{"Endpoints":{"docker":{"Host":"unix:///tmp/docker.sock"}}}]"#,
["--host",_,"container","ls","--all","--quiet","--no-trunc"]=>"container1\ncontainer2",
["--host",_,"container","inspect","--size",_,_]=>r#"[{"Id":"container1","Name":"/stopped","Created":"first","Image":"sha256:used","SizeRw":100,"State":{"Running":false},"Mounts":[{"Type":"volume","Name":"database"}]},{"Id":"container2","Name":"/running","Created":"second","Image":"sha256:used","SizeRw":50,"State":{"Running":true},"Mounts":[]}]"#,
["--host",_,"image","ls","--all","--no-trunc","--format","json"]=>concat!(r#"{"ID":"sha256:used","Repository":"base","Tag":"latest","Size":"1GB"}"#,"\n",r#"{"ID":"sha256:used","Repository":"base","Tag":"old","Size":"1GB"}"#,"\n",r#"{"ID":"sha256:unused","Repository":"preview","Tag":"latest","Size":"500MB"}"#),
["--host",_,"volume","ls","--format","json"]=>r#"{"Name":"database"}"#,
["--host",_,"volume","inspect","database"]=>r#"[{"CreatedAt":"first","Driver":"local","Options":null}]"#,
["--host",_,"buildx","inspect"]=>"Name: desktop-linux\nDriver: docker\nNodes:\nName: desktop-linux\nEndpoint: desktop-linux\nStatus: running",
["--host",_,"buildx","--builder","desktop-linux","du","--format=json"]=>r#"{"ID":"cache1","Description":"build cache","Reclaimable":true,"Shared":false,"Size":"200","LastUsedAt":"first"}"#,
_=>return Err(format!("Comando inesperado: {args:?}"))};
            Ok(body.as_bytes().to_vec())
        }
    }
    #[test]
    fn parses_local_snapshot_and_protects_all_references() {
        let r = snapshot(&Fake, PathBuf::from("docker")).unwrap();
        assert!(r.warnings.is_empty(), "{:?}", r.warnings);
        assert_eq!(r.items.len(), 6);
        assert!(r
            .items
            .iter()
            .find(|i| i.id == "container:container2")
            .unwrap()
            .blocked
            .is_some());
        assert!(r
            .items
            .iter()
            .find(|i| i.id == "image:sha256:used")
            .unwrap()
            .blocked
            .is_some());
        assert!(r
            .items
            .iter()
            .find(|i| i.id == "volume:database")
            .unwrap()
            .blocked
            .is_some());
        assert_eq!(
            r.items
                .iter()
                .find(|i| i.id == "cache:cache1")
                .unwrap()
                .bytes,
            Some(200)
        );
        assert!(r
            .items
            .iter()
            .find(|i| i.id == "image:sha256:unused")
            .unwrap()
            .blocked
            .is_none());
    }
}
