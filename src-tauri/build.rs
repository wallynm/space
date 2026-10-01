fn main() {
    println!("cargo:rerun-if-env-changed=FOLGA_UPDATE_URL");
    println!("cargo:rerun-if-env-changed=FOLGA_UPDATE_PUBLIC_KEY");
    tauri_build::build()
}
