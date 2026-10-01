use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Protection {
    pub paths: Vec<String>,
}
impl Protection {
    pub fn normalized(paths: Vec<String>) -> Result<Self, String> {
        let mut result = Vec::<PathBuf>::new();
        for path in paths {
            let p = PathBuf::from(path);
            if !p.is_absolute()
                || p.components()
                    .any(|c| matches!(c, std::path::Component::ParentDir))
            {
                return Err("Escolha uma pasta absoluta, sem atalhos ou caminhos relativos".into());
            }
            crate::engine::no_symlinks(&p)?;
            let p = std::fs::canonicalize(&p).map_err(|e| e.to_string())?;
            if !p.is_dir() {
                return Err("Proteja uma pasta existente".into());
            }
            if !result.iter().any(|r| p.starts_with(r)) {
                result.retain(|r| !r.starts_with(&p));
                result.push(p);
            }
        }
        result.sort();
        Ok(Self {
            paths: result
                .into_iter()
                .map(|p| p.to_string_lossy().into())
                .collect(),
        })
    }
    pub fn excludes(&self, p: &Path) -> bool {
        self.paths.iter().any(|scope| p.starts_with(scope))
    }
    pub fn reason(&self, p: &Path) -> Option<String> {
        self.paths
            .iter()
            .find(|scope| p.starts_with(scope) || Path::new(scope).starts_with(p))
            .map(|scope| format!("Pasta protegida por você: {scope}"))
    }
    pub fn check(&self, p: &Path) -> Result<(), String> {
        self.reason(p).map_or(Ok(()), Err)
    }
    pub fn docker_reason(&self) -> Option<String> {
        let home = dirs::home_dir()?;
        [
            ".docker",
            "Library/Containers/com.docker.docker",
            "Library/Group Containers/group.com.docker",
            "Library/Application Support/OrbStack",
        ]
        .iter()
        .find_map(|s| self.reason(&home.join(s)))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protects_ancestors_and_descendants_without_prefix_collisions() {
        let p = Protection {
            paths: vec!["/data/project/db".into()],
        };
        assert!(p.check(Path::new("/data/project")).is_err());
        assert!(p.check(Path::new("/data/project/db/file")).is_err());
        assert!(p.check(Path::new("/data/project/db-backup")).is_ok());
        assert!(!p.excludes(Path::new("/data/project")));
    }
    #[test]
    fn deduplicates_scopes_and_rejects_symbolic_links() {
        let d = tempfile::tempdir_in("/private/tmp").unwrap();
        let child = d.path().join("child");
        std::fs::create_dir(&child).unwrap();
        let p = Protection::normalized(vec![
            child.to_string_lossy().into(),
            d.path().to_string_lossy().into(),
        ])
        .unwrap();
        assert_eq!(p.paths.len(), 1);
        std::os::unix::fs::symlink(&child, d.path().join("link")).unwrap();
        assert!(
            Protection::normalized(vec![d.path().join("link").to_string_lossy().into()]).is_err()
        );
    }
}
