use cccc_sdk::{CCCCClient, CompatibilityRequirements};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = CCCCClient::discover()?;
    let requirements = CompatibilityRequirements {
        minimum_ipc_version: 1,
        operations: vec![
            "groups",
            "group_show",
            "send",
            "reply",
            "inbox_list",
            "context_get",
            "context_sync",
            "group_preamble_get",
            "send_files",
            "terminal_history",
            "term_resize",
            "web_model_delivery_preferences_get",
            "web_model_delivery_preferences_update",
            "web_model_runtime_recover_turn",
        ],
        ..Default::default()
    };
    let daemon = client.assert_compatible(&requirements)?;
    println!(
        "CCCC {} ({}) is compatible with IPC v{}",
        daemon.version,
        daemon.implementation.as_deref().unwrap_or("unknown"),
        daemon.ipc_v
    );
    Ok(())
}
