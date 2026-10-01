// Read-only native smoke check. This example cannot remove files.
use folga_lib::engine::{default_roots, disk_info, scan};
use std::sync::atomic::AtomicBool;
fn main() -> Result<(), String> {
    let disk = disk_info()?;
    println!(
        "volume={} total={} free={} used={}",
        disk.volume, disk.total, disk.free, disk.used
    );
    let report = scan(default_roots(), &AtomicBool::new(false), |_| {})?;
    let removable: u64 = report
        .candidates
        .iter()
        .filter(|item| item.blocked.is_none() && item.risk == "cache")
        .map(|item| item.bytes)
        .sum();
    let blocked = report
        .candidates
        .iter()
        .filter(|item| item.blocked.is_some())
        .count();
    println!(
        "roots={} directories={} candidates={} blocked={} warnings={} cache_bytes={} elapsed_ms={}",
        report.roots.len(),
        report.scanned_dirs,
        report.candidates.len(),
        blocked,
        report.warnings.len(),
        removable,
        report.elapsed_ms
    );
    Ok(())
}
