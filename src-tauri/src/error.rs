use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// Application error type, serialized to the frontend as
/// `{ kind, message, diskMtimeMs? }` so the UI can branch on `kind`
/// (e.g. showing the conflict banner for `kind === "conflict"`).
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("no vault is open")]
    NoVault,
    #[error("invalid note id: {0}")]
    InvalidId(String),
    #[error("note not found: {0}")]
    NotFound(String),
    #[error("a note named \"{0}\" already exists")]
    AlreadyExists(String),
    #[error("this file changed on disk")]
    Conflict { disk_mtime_ms: u64 },
    #[error("{0}")]
    Other(String),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Io(_) => "io",
            AppError::NoVault => "noVault",
            AppError::InvalidId(_) => "invalidId",
            AppError::NotFound(_) => "notFound",
            AppError::AlreadyExists(_) => "alreadyExists",
            AppError::Conflict { .. } => "conflict",
            AppError::Other(_) => "other",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut st = serializer.serialize_struct("AppError", 3)?;
        st.serialize_field("kind", self.kind())?;
        st.serialize_field("message", &self.to_string())?;
        if let AppError::Conflict { disk_mtime_ms } = self {
            st.serialize_field("diskMtimeMs", disk_mtime_ms)?;
        }
        st.end()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
