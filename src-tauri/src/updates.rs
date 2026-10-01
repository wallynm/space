use serde::Serialize;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateView {
    pub current_version: String,
    pub configured: bool,
    pub check_on_launch: bool,
    pub phase: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub error: Option<String>,
}
pub struct UpdateState {
    pub view: UpdateView,
    pub pending: Option<Update>,
}
impl Default for UpdateState {
    fn default() -> Self {
        Self {
            view: UpdateView {
                current_version: env!("CARGO_PKG_VERSION").into(),
                configured: source().is_ok(),
                check_on_launch: true,
                phase: "idle".into(),
                version: None,
                notes: None,
                downloaded: 0,
                total: None,
                error: None,
            },
            pending: None,
        }
    }
}
fn https_url(value: &str) -> Result<url::Url, String> {
    let u = url::Url::parse(value).map_err(|_| "Endereço de atualização inválido")?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
    {
        return Err("Atualizações exigem um endereço HTTPS sem credenciais".into());
    }
    Ok(u)
}
fn source() -> Result<(url::Url, &'static str), String> {
    let endpoint = option_env!("FOLGA_UPDATE_URL")
        .filter(|s| !s.is_empty())
        .ok_or("Atualizações ainda não publicadas para esta edição")?;
    let key = option_env!("FOLGA_UPDATE_PUBLIC_KEY")
        .filter(|s| !s.trim().is_empty())
        .ok_or("Chave pública de atualização ausente")?;
    Ok((https_url(endpoint)?, key))
}
fn change(app: &tauri::AppHandle, f: impl FnOnce(&mut UpdateState)) -> Result<UpdateView, String> {
    let state = app.state::<crate::AppState>();
    let mut update = state.updates.lock().map_err(|e| e.to_string())?;
    f(&mut update);
    let _ = app.emit("updates-changed", update.view.clone());
    Ok(update.view.clone())
}
#[tauri::command]
pub fn get_updates(state: tauri::State<crate::AppState>) -> Result<UpdateView, String> {
    state
        .updates
        .lock()
        .map(|u| u.view.clone())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn set_update_preferences(
    app: tauri::AppHandle,
    check_on_launch: bool,
) -> Result<UpdateView, String> {
    let state = app.state::<crate::AppState>();
    let _guard = crate::acquire(&state, &app, "Salvando preferências de atualização")?;
    crate::write_json(
        &crate::data_path(&app, "update-preferences.json")?,
        &serde_json::json!({"checkOnLaunch": check_on_launch}),
    )?;
    change(&app, |u| u.view.check_on_launch = check_on_launch)
}
async fn cancellable<T>(
    app: &tauri::AppHandle,
    f: impl std::future::Future<Output = Result<T, tauri_plugin_updater::Error>>,
) -> Result<T, String> {
    tokio::select! {
        result = f => result.map_err(|e| e.to_string()),
        _ = async { loop {
            if app.state::<crate::AppState>().cancel.load(Ordering::Relaxed) { break; }
            tokio::time::sleep(Duration::from_millis(80)).await;
        }} => Err("Atualização interrompida".into())
    }
}
#[tauri::command]
pub async fn check_updates(app: tauri::AppHandle) -> Result<UpdateView, String> {
    let (url, key) = source()?;
    let state = app.state::<crate::AppState>();
    let _guard = crate::acquire(&state, &app, "Procurando atualizações")?;
    change(&app, |u| {
        u.pending = None;
        u.view.phase = "checking".into();
        u.view.error = None;
        u.view.version = None;
        u.view.notes = None;
        u.view.downloaded = 0;
        u.view.total = None;
    })?;
    let result = async {
        let updater = app
            .updater_builder()
            .pubkey(key)
            .configure_client(|c| c.https_only(true))
            .endpoints(vec![url])
            .map_err(|e| e.to_string())?
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        let pending = cancellable(&app, updater.check()).await?;
        if let Some(update) = &pending {
            https_url(update.download_url.as_str())?;
        }
        change(&app, |u| {
            u.view.phase = if pending.is_some() {
                "available"
            } else {
                "current"
            }
            .into();
            u.view.version = pending.as_ref().map(|p| p.version.clone());
            u.view.notes = pending.as_ref().and_then(|p| p.body.clone());
            u.pending = pending;
        })
    }
    .await;
    if let Err(e) = &result {
        let _ = change(&app, |u| {
            u.view.phase = "error".into();
            u.view.error = Some(e.clone());
        });
    }
    result
}
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle, version: String) -> Result<UpdateView, String> {
    source()?;
    let state = app.state::<crate::AppState>();
    let _guard = crate::acquire(&state, &app, "Baixando atualização")?;
    let mut pending = state
        .updates
        .lock()
        .map_err(|e| e.to_string())?
        .pending
        .clone()
        .ok_or("Confira as atualizações primeiro")?;
    if pending.version != version {
        return Err("Versão alterada; confira novamente antes de instalar".into());
    }
    https_url(pending.download_url.as_str())?;
    pending.timeout = Some(Duration::from_secs(120));
    change(&app, |u| {
        u.view.phase = "downloading".into();
        u.view.error = None;
        u.view.downloaded = 0;
    })?;
    let result = async {
        let bytes = cancellable(
            &app,
            pending.download(
                |chunk, total| {
                    let view = change(&app, |u| {
                        u.view.downloaded += chunk as u64;
                        u.view.total = total;
                    });
                    if let Ok(v) = view {
                        crate::activity::progress(
                            &app,
                            crate::activity::Detail {
                                bytes: v.downloaded,
                                stage: "Baixando atualização".into(),
                                ..Default::default()
                            },
                        );
                    }
                },
                || {},
            ),
        )
        .await?;
        if state.cancel.load(Ordering::Relaxed) {
            return Err("Atualização interrompida".into());
        }
        change(&app, |u| u.view.phase = "installing".into())?;
        crate::activity::progress(
            &app,
            crate::activity::Detail {
                stage: "Instalando atualização verificada".into(),
                ..Default::default()
            },
        );
        pending.install(bytes).map_err(|e| e.to_string())?;
        change(&app, |u| {
            u.view.phase = "installed".into();
            u.pending = None;
        })
    }
    .await;
    if let Err(e) = &result {
        let _ = change(&app, |u| {
            u.view.phase = "error".into();
            u.view.error = Some(e.clone());
        });
    }
    result
}
#[tauri::command]
pub fn restart_updated(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    if state.busy.load(Ordering::SeqCst) {
        return Err("Aguarde a operação em andamento".into());
    }
    if state.updates.lock().map_err(|e| e.to_string())?.view.phase != "installed" {
        return Err("Nenhuma atualização instalada aguardando reinício".into());
    }
    app.restart()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn update_sources_require_https_and_no_credentials() {
        assert!(https_url("http://example.com/latest.json").is_err());
        assert!(https_url("https://user:pass@example.com/latest.json").is_err());
        assert!(https_url("file:///tmp/update").is_err());
        assert!(https_url("https://example.com/latest.json").is_ok());
    }

    fn download_fixture(
        payload: Vec<u8>,
        version: &str,
        signature: &str,
    ) -> Result<Vec<u8>, String> {
        use std::{
            io::{Read, Write},
            net::TcpListener,
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let endpoint = format!("http://{address}/latest.json");
        let manifest = serde_json::json!({"version":version, "platforms":{"darwin-aarch64":{"url":format!("http://{address}/payload"),"signature":signature}}}).to_string();
        let server = std::thread::spawn(move || {
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut request = [0u8; 8192];
                let count = stream.read(&mut request).unwrap();
                let body =
                    if String::from_utf8_lossy(&request[..count]).starts_with("GET /latest.json") {
                        manifest.as_bytes()
                    } else {
                        &payload
                    };
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();
                stream.write_all(body).unwrap();
            }
        });
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert(
            "updater".into(),
            serde_json::json!({
                "pubkey": include_str!("../fixtures/update-public-key.txt").trim(),
                "requireSignedVersion": true,
                // HTTP is allowed only in this isolated loopback test. Production enforces HTTPS.
                "dangerousInsecureTransportProtocol": true,
                "endpoints": [endpoint]
            }),
        );
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .unwrap();
        let result = tauri::async_runtime::block_on(async {
            let pending = app
                .updater_builder()
                .target("darwin-aarch64")
                .timeout(Duration::from_secs(3))
                .build()
                .unwrap()
                .check()
                .await
                .map_err(|e| e.to_string())?
                .unwrap();
            pending
                .download(|_, _| {}, || {})
                .await
                .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }
    #[test]
    fn updater_download_verifies_signature_and_rejects_tampering_and_wrong_version() {
        let payload = include_bytes!("../fixtures/update-payload.txt").to_vec();
        let signature = include_str!("../fixtures/update-payload.sig").trim();
        assert_eq!(
            download_fixture(payload.clone(), "0.4.0", signature).unwrap(),
            payload
        );
        assert!(download_fixture(b"tampered data".to_vec(), "0.4.0", signature).is_err());
        assert!(download_fixture(payload.clone(), "0.5.0", signature).is_err());
        assert!(download_fixture(payload, "0.4.0", "AAAA").is_err());
    }
}
