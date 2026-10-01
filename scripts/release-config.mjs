export function https(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw new Error("Use HTTPS sem credenciais para publicar as atualizações.");
  return u;
}
export function validateRelease(env) {
  https(env.FOLGA_UPDATE_URL);
  https(env.FOLGA_UPDATE_DOWNLOAD_BASE);
  if (!env.FOLGA_UPDATE_PUBLIC_KEY?.trim())
    throw new Error("Informe FOLGA_UPDATE_PUBLIC_KEY.");
  if (!env.TAURI_SIGNING_PRIVATE_KEY && !env.TAURI_SIGNING_PRIVATE_KEY_PATH)
    throw new Error(
      "Informe a chave privada de assinatura do updater por variável de ambiente ou caminho de arquivo.",
    );
  if (
    env.FOLGA_NOTARY_PROFILE &&
    (!env.APPLE_SIGNING_IDENTITY || env.APPLE_SIGNING_IDENTITY === "-")
  )
    throw new Error("Notarização exige uma identidade Apple válida.");
}
export function releaseManifest({
  version,
  arch,
  filename,
  signature,
  downloadBase,
  notes,
}) {
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version))
    throw new Error("Versão inválida.");
  if (!signature.trim()) throw new Error("Pacote sem assinatura.");
  if (filename.includes("/") || filename.includes(".."))
    throw new Error("Nome de pacote inválido.");
  const base = https(downloadBase);
  base.pathname = base.pathname.replace(/\/?$/, "/");
  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      [`darwin-${arch}`]: { signature, url: new URL(filename, base).href },
    },
  };
}
