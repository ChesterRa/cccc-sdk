use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::{CCCCClient, Result};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct VoiceDocumentFolder {
    pub folder_id: String,
    pub name: String,
}

/// Stored index, including archived documents but excluding deleted entries.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct VoiceDocumentLibrary {
    pub folders: Vec<VoiceDocumentFolder>,
    pub root_order: Vec<String>,
    pub documents: Vec<Map<String, Value>>,
}

/// Library metadata changes never move Markdown files. Restore preserves folders.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum VoiceDocumentLibraryAction {
    CreateFolder {
        name: String,
    },
    RenameFolder {
        folder_id: String,
        name: String,
    },
    RemoveFolder {
        folder_id: String,
    },
    /// Mixed folder:<id> / document:<path> keys; an empty list clears ordering.
    ReorderRoot {
        root_order: Vec<String>,
    },
    Rename {
        document_path: String,
        name: String,
    },
    /// An empty folder_id moves the document to root.
    Move {
        document_path: String,
        folder_id: String,
    },
    Restore {
        document_path: String,
    },
}

impl CCCCClient {
    /// Read the stored library without workspace discovery or content reconciliation.
    pub fn assistant_voice_document_library(&self, group_id: &str) -> Result<VoiceDocumentLibrary> {
        let result = self.call(
            "assistant_voice_document_library",
            Map::from_iter([("group_id".into(), json!(group_id))]),
        )?;
        Ok(serde_json::from_value(Value::Object(result))?)
    }

    /// The daemon enforces writer permission; omitted `by` means the local user.
    pub fn assistant_voice_document_library_update(
        &self,
        group_id: &str,
        action: &VoiceDocumentLibraryAction,
        by: Option<&str>,
    ) -> Result<VoiceDocumentLibrary> {
        let mut args: Map<String, Value> = serde_json::from_value(serde_json::to_value(action)?)?;
        args.insert("group_id".into(), json!(group_id));
        args.insert("by".into(), json!(by.unwrap_or("user")));
        let result = self.call("assistant_voice_document_library_update", args)?;
        Ok(serde_json::from_value(Value::Object(result))?)
    }

    /// Permanently delete the Markdown file. Archive instead to retain the file.
    pub fn assistant_voice_document_delete(
        &self,
        group_id: &str,
        document_path: &str,
        by: Option<&str>,
    ) -> Result<Map<String, Value>> {
        self.call(
            "assistant_voice_document_delete",
            Map::from_iter([
                ("group_id".into(), json!(group_id)),
                ("document_path".into(), json!(document_path)),
                ("by".into(), json!(by.unwrap_or("user"))),
            ]),
        )
    }
}
