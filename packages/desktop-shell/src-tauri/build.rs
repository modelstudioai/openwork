fn main() {
    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("windows-app-manifest.xml"));
    let manifest = tauri_build::AppManifest::new().commands(&[
        "bootstrap_state",
        "choose_workspace",
        "local_control_status",
        "enable_local_control",
        "disable_local_control",
        "open_logs",
        "restart_runtime",
        "set_interface_zoom",
        "read_openwork_client_state",
        "write_openwork_client_state",
        "browser_open",
        "browser_set_bounds",
        "browser_navigate",
        "browser_close",
        "notify_turn_complete",
        "proxy_status",
        "list_pets",
        "resolve_pet_sprite",
        "toggle_pet",
        "check_for_updates",
        "install_update",
        "take_pending_deep_links",
    ]);
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(windows)
        .app_manifest(manifest);
    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
