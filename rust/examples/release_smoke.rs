//! Mutating smoke: run only with an explicitly supplied disposable CCCC_HOME.
use cccc_sdk::{CCCCClient, VoiceDocumentLibraryAction as Action};
use serde_json::{json, Map, Value};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let home = std::path::PathBuf::from(
        std::env::var_os("CCCC_HOME").expect("isolated CCCC_HOME required"),
    );
    let client = CCCCClient::discover()?;
    let call = |op: &str, args: Value| client.call(op, args.as_object().expect("object").clone());
    let group = call("group_create", json!({"title":"Rust SDK release fixture"}))?;
    let group_id = group["group"]["group_id"].as_str().expect("group id");
    call(
        "group_set_state",
        json!({"group_id":group_id,"state":"paused"}),
    )?;
    let path = "notes/sdk.md";
    call(
        "assistant_voice_document_save",
        json!({"group_id":group_id,"document_path":path,"content":"# SDK fixture"}),
    )?;
    let library = client.assistant_voice_document_library_update(
        group_id,
        &Action::CreateFolder {
            name: "Meetings".into(),
        },
        None,
    )?;
    let folder_id = library.folders[0].folder_id.clone();
    for action in [
        Action::RenameFolder {
            folder_id: folder_id.clone(),
            name: "Notes".into(),
        },
        Action::Rename {
            document_path: path.into(),
            name: "Summary".into(),
        },
        Action::Move {
            document_path: path.into(),
            folder_id: folder_id.clone(),
        },
    ] {
        client.assistant_voice_document_library_update(group_id, &action, None)?;
    }
    call(
        "assistant_voice_document_archive",
        json!({"group_id":group_id,"document_path":path}),
    )?;
    let library = client.assistant_voice_document_library(group_id)?;
    assert_eq!(library.documents[0]["status"], "archived");
    let file = home
        .join("voice-secretary")
        .join(group_id)
        .join("documents")
        .join(path);
    assert_eq!(std::fs::read_to_string(&file)?, "# SDK fixture");
    let library = client.assistant_voice_document_library_update(
        group_id,
        &Action::Restore {
            document_path: path.into(),
        },
        None,
    )?;
    assert_eq!(library.documents[0]["status"], "active");
    assert_eq!(library.documents[0]["folder_id"], folder_id);
    client.assistant_voice_document_library_update(
        group_id,
        &Action::Move {
            document_path: path.into(),
            folder_id: "".into(),
        },
        None,
    )?;
    let order = vec![format!("folder:{folder_id}"), format!("document:{path}")];
    let library = client.assistant_voice_document_library_update(
        group_id,
        &Action::ReorderRoot {
            root_order: order.clone(),
        },
        None,
    )?;
    assert_eq!(library.root_order, order);
    let library = client.assistant_voice_document_library_update(
        group_id,
        &Action::ReorderRoot { root_order: vec![] },
        None,
    )?;
    assert!(library.root_order.is_empty());
    client.assistant_voice_document_library_update(
        group_id,
        &Action::RemoveFolder { folder_id },
        None,
    )?;
    let deleted = client.assistant_voice_document_delete(group_id, path, None)?;
    assert_eq!(deleted["event"]["data"]["action"], "deleted");
    assert!(!file.exists());
    assert!(client
        .assistant_voice_document_library(group_id)?
        .documents
        .is_empty());
    assert!(client
        .assistant_voice_document_library_update(
            group_id,
            &Action::Restore {
                document_path: path.into()
            },
            None
        )
        .is_err());

    // Persist configuration only. No browser/provider starts in this paused Group.
    for (id, runtime) in [
        ("chat1", "web_model"),
        ("chat2", "web_model"),
        ("bot", "grok_web_model"),
    ] {
        let actor = call(
            "actor_add",
            json!({"group_id":group_id,"actor_id":id,"runtime":runtime}),
        )?;
        assert_eq!(actor["actor"]["runtime"], runtime);
        assert_eq!(actor["actor"]["runner"], "headless");
    }
    let group: Map<String, Value> = client.group_show(group_id)?;
    assert_eq!(group["group"]["state"], "paused");
    println!("Installed Rust artifact: Voice library lifecycle and Web Model configuration passed");
    Ok(())
}
