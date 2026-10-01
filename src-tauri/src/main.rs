#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    if folga_lib::worker_main() {
        return;
    }
    folga_lib::run();
}
