// Read-only integration check. No cleanup or trash functions are called.
use folga_lib::{applications, catalog, docker, system};
use std::sync::atomic::AtomicBool;
fn main() -> Result<(), String> {
    if folga_lib::worker_main() {
        return Ok(());
    }
    let cancel = AtomicBool::new(false);
    let path = std::env::args()
        .nth(1)
        .ok_or("Informe uma pasta de teste")?;
    let mut r = catalog::scan(path, &cancel, |_| {})?;
    let children = catalog::children(&r, &r.root)?;
    let duplicates = catalog::duplicates(&mut r, &cancel, |_| {})?;
    println!("catalog visited={} bytes={} children={} large={} projects={} duplicate_groups={} partial={} warnings={}",r.visited,r.bytes,children.len(),r.files.len(),r.projects.len(),duplicates.len(),r.incomplete,r.warnings.len());
    let sys = system::diagnose(&cancel)?;
    println!(
        "apfs container_free={:?} data_bytes={:?} purgeable={:?} snapshots={} warnings={}",
        sys.container_free,
        sys.data_bytes,
        sys.purgeable_bytes,
        sys.snapshots.len(),
        sys.warnings.len()
    );
    match docker::scan(&cancel) {
        Ok(d) => println!(
            "docker context={} items={} warnings={}",
            d.context,
            d.items.len(),
            d.warnings.len()
        ),
        Err(e) => println!("docker unavailable={e}"),
    }
    if std::env::args().any(|a| a == "--apps") {
        let a = applications::scan(false, &cancel, |_| {})?;
        println!(
            "apps installed={} residue_candidates={} parts={} warnings={}",
            a.apps.iter().filter(|a| !a.leftover).count(),
            a.apps.iter().filter(|a| a.leftover).count(),
            a.apps.iter().map(|a| a.parts.len()).sum::<usize>(),
            a.warnings.len()
        );
    }
    Ok(())
}
