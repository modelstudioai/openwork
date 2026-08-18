#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_state;
mod local_control;
mod runtime;

use command_group::GroupChild;
use desktop_state::{
    default_window_size, restore_window, valid_pet_id, OpenWorkClientState, SettingsStore,
};
use local_control::{LocalControlInfo, LocalControlSession};
use runtime::{resolve_workspace, stop_runtime_handle, DesktopRuntime};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::menu::{AboutMetadata, Menu, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::webview::{DownloadEvent, NewWindowResponse, WebviewBuilder, WebviewWindowBuilder};
use tauri::{
    AppHandle, Emitter, Listener, LogicalPosition, LogicalSize, Manager, RunEvent, State,
    WebviewUrl, WebviewWindow, WindowEvent,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

#[cfg(debug_assertions)]
const BOOTSTRAP_URL: &str = "http://127.0.0.1:1420";
#[cfg(all(not(debug_assertions), target_os = "windows"))]
const BOOTSTRAP_URL: &str = "http://tauri.localhost";
#[cfg(all(not(debug_assertions), not(target_os = "windows")))]
const BOOTSTRAP_URL: &str = "tauri://localhost";
#[cfg(target_os = "macos")]
static FULLSCREEN_HIDE_PENDING: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "macos")]
static FULLSCREEN_HIDE_GENERATION: AtomicU64 = AtomicU64::new(0);
// Keep the default first-launch workspace aligned with the Electron shell's
// getDefaultConversationWorkspacePath() in
// packages/desktop/packages/shared/src/config/storage.ts: ~/Documents/OpenWork,
// relocatable through OPENWORK_DEFAULT_WORKSPACE_DIR (see default_workspace).
const DEFAULT_WORKSPACE_DIRECTORY: &str = "OpenWork";
static PENDING_DEEP_LINKS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    desktop_version: String,
    status: &'static str,
    workspace: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStopped {
    runtime_id: u64,
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: String,
    display_name: String,
    description: String,
    spritesheet_path: PathBuf,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PetInfo {
    id: String,
    display_name: String,
    description: String,
}

// A runtime that has spawned but may still be inside DesktopRuntime::start's
// startup wait. Shares the child handle with the DesktopRuntime it becomes,
// so a stop during that window kills the in-flight daemon instead of
// orphaning it in its own process group.
struct PendingRuntime {
    generation: u64,
    child: Arc<Mutex<Option<GroupChild>>>,
    stopping: Arc<AtomicBool>,
}

impl PendingRuntime {
    fn stop(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        stop_runtime_handle(&self.child);
    }
}

struct ApplicationState {
    runtime: Mutex<Option<DesktopRuntime>>,
    pending_runtime: Mutex<Option<PendingRuntime>>,
    local_control: Mutex<Option<LocalControlSession>>,
    local_control_menu: MenuItem<tauri::Wry>,
    local_control_off_menu: MenuItem<tauri::Wry>,
    settings: SettingsStore,
    log_path: PathBuf,
    origin: Arc<Mutex<Option<Url>>>,
    last_error: Mutex<Option<String>>,
    last_workspace: Mutex<Option<(PathBuf, bool)>>,
    window_dirty: AtomicBool,
    start_generation: AtomicU64,
    starting: AtomicU64,
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            focus_main_window(app);
            emit_deep_links(app, args.iter().map(String::as_str));
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin({
            let builder = tauri_plugin_updater::Builder::new();
            match option_env!("OPENWORK_UPDATER_PUBLIC_KEY") {
                Some(public_key) => builder.pubkey(public_key).build(),
                None => builder.build(),
            }
        })
        .on_menu_event(|app, event| {
            if event.id() == "local-control" {
                if let Err(error) = show_local_control_window(app) {
                    eprintln!("{error}");
                }
            } else if event.id() == "local-control-off" {
                stop_local_control(app);
            } else if event.id() == "repository" {
                let _ = open::that_detached("https://github.com/modelstudioai/openwork");
            } else if matches!(
                event.id().as_ref(),
                "new"
                    | "settings"
                    | "worktree"
                    | "shortcuts"
                    | "browser"
                    | "pet"
                    | "update"
                    | "zoom-in"
                    | "zoom-out"
                    | "zoom-reset"
            ) {
                let _ = app.emit_to("main", "openwork-menu", event.id().as_ref());
            }
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_state,
            choose_workspace,
            local_control_status,
            enable_local_control,
            disable_local_control,
            open_logs,
            restart_runtime,
            set_interface_zoom,
            read_openwork_client_state,
            write_openwork_client_state,
            browser_open,
            browser_set_bounds,
            browser_navigate,
            browser_close,
            notify_turn_complete,
            proxy_status,
            list_pets,
            resolve_pet_sprite,
            toggle_pet,
            check_for_updates,
            install_update,
            take_pending_deep_links,
        ])
        .setup(setup_app);

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("Failed to initialize OpenWork desktop: {error}");
            return;
        }
    };

    app.run(|app_handle, event| match event {
        RunEvent::WindowEvent { label, event, .. } if label == "main" => match event {
            WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                app_handle
                    .state::<ApplicationState>()
                    .window_dirty
                    .store(true, Ordering::Relaxed);
            }
            #[cfg(target_os = "macos")]
            WindowEvent::Focused(true) => {
                cancel_pending_fullscreen_hide();
            }
            #[cfg(target_os = "macos")]
            WindowEvent::CloseRequested { api, .. } => {
                save_window_state(app_handle);
                api.prevent_close();
                if let Some(window) = app_handle.get_webview_window("main") {
                    if FULLSCREEN_HIDE_PENDING.load(Ordering::Acquire) {
                        return;
                    }
                    if window.is_fullscreen().unwrap_or(false) {
                        if window.set_fullscreen(false).is_err() {
                            FULLSCREEN_HIDE_PENDING.store(false, Ordering::Release);
                            return;
                        }
                        let hide_generation =
                            FULLSCREEN_HIDE_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
                        FULLSCREEN_HIDE_PENDING.store(true, Ordering::Release);
                        let app = app_handle.clone();
                        let win = window.clone();
                        // ponytail: remove this delay when Tauri exposes fullscreen-exit events.
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            let _ = app.run_on_main_thread(move || {
                                if take_pending_fullscreen_hide(hide_generation) {
                                    let _ = win.hide();
                                }
                            });
                        });
                    } else {
                        let _ = window.hide();
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            WindowEvent::CloseRequested { .. } => save_window_state(app_handle),
            _ => {}
        },
        RunEvent::WindowEvent { label, event, .. } if label == "local-control" => {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                stop_local_control(app_handle);
            }
        }
        RunEvent::Exit | RunEvent::ExitRequested { .. } => {
            save_window_state(app_handle);
            stop_runtime(app_handle);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } if should_restore_main_window(
            has_visible_windows,
            app_handle.get_webview_window("main").is_some_and(|window| {
                !window.is_visible().unwrap_or(false) || window.is_minimized().unwrap_or(false)
            }),
        ) =>
        {
            focus_main_window(app_handle)
        }
        _ => {}
    });
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let menu = Menu::new(&handle)?;
    let local_control_menu =
        MenuItemBuilder::with_id("local-control", "Local Control: Off…").build(&handle)?;
    let local_control_off_menu =
        MenuItemBuilder::with_id("local-control-off", "Turn Off Local Control")
            .enabled(false)
            .build(&handle)?;
    let new_task = MenuItemBuilder::with_id("new", "New Task")
        .accelerator("CmdOrCtrl+N")
        .build(&handle)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(&handle)?;
    let worktree = MenuItemBuilder::with_id("worktree", "New Worktree Project…").build(&handle)?;
    let shortcuts = MenuItemBuilder::with_id("shortcuts", "Keyboard Shortcuts").build(&handle)?;
    let browser = MenuItemBuilder::with_id("browser", "Browser Dock").build(&handle)?;
    let pet = MenuItemBuilder::with_id("pet", "Desktop Pet").build(&handle)?;
    let update = MenuItemBuilder::with_id("update", "Check for Updates…").build(&handle)?;
    let repository = MenuItemBuilder::with_id("repository", "OpenWork on GitHub").build(&handle)?;
    let zoom_in = MenuItemBuilder::with_id("zoom-in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(&handle)?;
    let zoom_out = MenuItemBuilder::with_id("zoom-out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(&handle)?;
    let zoom_reset = MenuItemBuilder::with_id("zoom-reset", "Actual Size")
        .accelerator("CmdOrCtrl+0")
        .build(&handle)?;
    let about = AboutMetadata {
        name: Some("OpenWork".to_string()),
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        authors: Some(vec![
            "ModelStudio".to_string(),
            "Qwen Code Team".to_string(),
        ]),
        comments: Some("OpenWork desktop, powered by the Qwen Code agent engine.".to_string()),
        copyright: Some("Copyright © ModelStudio and Qwen Code contributors".to_string()),
        license: Some("Apache-2.0".to_string()),
        website: Some("https://github.com/modelstudioai/openwork".to_string()),
        website_label: Some("OpenWork on GitHub".to_string()),
        credits: Some("OpenWork by ModelStudio\nQwen Code agent engine by QwenLM".to_string()),
        ..Default::default()
    };
    #[cfg(target_os = "macos")]
    menu.append(
        &SubmenuBuilder::new(&handle, "OpenWork")
            .about(Some(about.clone()))
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?,
    )?;
    menu.append(
        &SubmenuBuilder::new(&handle, "File")
            .item(&new_task)
            .item(&worktree)
            .item(&settings)
            .separator()
            .close_window()
            .quit()
            .build()?,
    )?;
    menu.append(
        &SubmenuBuilder::new(&handle, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?,
    )?;
    menu.append(
        &SubmenuBuilder::new(&handle, "View")
            .item(&browser)
            .item(&pet)
            .item(&shortcuts)
            .separator()
            .item(&zoom_in)
            .item(&zoom_out)
            .item(&zoom_reset)
            .separator()
            .fullscreen()
            .build()?,
    )?;
    menu.append(
        &SubmenuBuilder::new(&handle, "Control")
            .item(&local_control_menu)
            .item(&local_control_off_menu)
            .build()?,
    )?;
    menu.append(
        &SubmenuBuilder::new(&handle, "Window")
            .minimize()
            .maximize()
            .close_window()
            .build()?,
    )?;
    let help = SubmenuBuilder::new(&handle, "Help")
        .item(&repository)
        .item(&update);
    #[cfg(not(target_os = "macos"))]
    let help = help.separator().about(Some(about));
    menu.append(&help.build()?)?;
    handle.set_menu(menu)?;
    let settings = SettingsStore::load(&handle).map_err(std::io::Error::other)?;
    let window_state = settings.window();
    let log_path = desktop_log_path(&handle).map_err(std::io::Error::other)?;
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&log_path, b"");
    let origin = Arc::new(Mutex::new(None));
    let navigation_origin = Arc::clone(&origin);
    let runtime_exit_handle = handle.clone();
    handle.listen("runtime-process-stopped", move |event| {
        let Ok(stopped) = serde_json::from_str::<RuntimeStopped>(event.payload()) else {
            return;
        };
        let state = runtime_exit_handle.state::<ApplicationState>();
        if lock(&state.runtime).as_ref().map(DesktopRuntime::id) != Some(stopped.runtime_id) {
            return;
        }
        stop_runtime(&runtime_exit_handle);
        *lock(&state.origin) = None;
        let message = format!("OpenWork stopped: {}", stopped.status);
        *lock(&state.last_error) = Some(message.clone());
        let _ = navigate_to_bootstrap(&runtime_exit_handle);
        let _ = runtime_exit_handle.emit("runtime-failed", message);
    });
    let (width, height) = default_window_size();

    let window = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("index.html".into()))
        .title("OpenWork")
        .inner_size(width, height)
        .min_inner_size(900.0, 600.0)
        .on_navigation(move |url| is_allowed_navigation(url, &navigation_origin))
        .on_new_window(|url, _features| {
            if is_safe_external_url(&url) {
                let _ = open::that_detached(url.as_str());
            }
            NewWindowResponse::Deny
        })
        .on_download(|webview, event| match event {
            DownloadEvent::Requested { url, .. } => webview
                .url()
                .ok()
                .and_then(|current| origin_of(&current).ok())
                .is_some_and(|current_origin| {
                    url.scheme() == "blob"
                        && lock(&webview.app_handle().state::<ApplicationState>().origin)
                            .as_ref()
                            .is_some_and(|runtime_origin| current_origin == *runtime_origin)
                }),
            DownloadEvent::Finished { .. } => true,
            _ => false,
        })
        .build()?;
    restore_window(&window, window_state.as_ref());
    let deep_link_handle = handle.clone();
    handle.deep_link().on_open_url(move |event| {
        emit_deep_links(
            &deep_link_handle,
            event.urls().iter().map(|url| url.as_str()),
        );
    });
    #[cfg(any(target_os = "linux", all(debug_assertions, target_os = "windows")))]
    let _ = handle.deep_link().register_all();

    handle.manage(ApplicationState {
        runtime: Mutex::new(None),
        pending_runtime: Mutex::new(None),
        local_control: Mutex::new(None),
        local_control_menu,
        local_control_off_menu,
        settings,
        log_path,
        origin,
        last_error: Mutex::new(None),
        last_workspace: Mutex::new(None),
        window_dirty: AtomicBool::new(false),
        start_generation: AtomicU64::new(0),
        starting: AtomicU64::new(0),
    });

    match initial_workspace(&handle) {
        Ok((workspace, create_if_missing)) => {
            start_runtime_async(handle.clone(), workspace, create_if_missing)
        }
        Err(error) => {
            *lock(&handle.state::<ApplicationState>().last_error) = Some(error.clone());
            let _ = handle.emit("runtime-failed", error);
        }
    }
    spawn_window_state_flusher(handle);
    Ok(())
}

#[tauri::command]
fn bootstrap_state(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
) -> Result<BootstrapState, String> {
    require_bootstrap_origin(&webview)?;
    let starting = state.starting.load(Ordering::SeqCst) != 0;
    let running = lock(&state.runtime).is_some();
    let workspace = bootstrap_workspace(
        lock(&state.last_workspace).clone(),
        state.settings.workspace(),
    );
    Ok(BootstrapState {
        desktop_version: env!("CARGO_PKG_VERSION").to_string(),
        status: if running {
            "ready"
        } else if starting {
            "starting"
        } else {
            "idle"
        },
        workspace: workspace.map(|path| path.to_string_lossy().into_owned()),
        error: lock(&state.last_error).clone(),
    })
}

fn bootstrap_workspace(
    last_workspace: Option<(PathBuf, bool)>,
    persisted_workspace: Option<PathBuf>,
) -> Option<PathBuf> {
    last_workspace
        .map(|(workspace, _)| workspace)
        .or(persisted_workspace)
}

#[tauri::command]
async fn choose_workspace(
    webview: WebviewWindow,
    app: AppHandle,
) -> Result<Option<String>, String> {
    require_bootstrap_origin(&webview)?;
    let folder = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .set_title("Choose a OpenWork workspace")
                .blocking_pick_folder()
        }
    })
    .await
    .map_err(|error| format!("Failed to show workspace picker: {error}"))?;
    let Some(folder) = folder else {
        return Ok(None);
    };
    let workspace = folder
        .into_path()
        .map_err(|error| format!("Failed to read selected workspace: {error}"))?;
    start_runtime_async(app, workspace.clone(), false);
    Ok(Some(workspace.to_string_lossy().into_owned()))
}

#[tauri::command]
fn restart_runtime(webview: WebviewWindow, app: AppHandle) -> Result<(), String> {
    require_bootstrap_origin(&webview)?;
    let last_workspace = lock(&app.state::<ApplicationState>().last_workspace).clone();
    let (workspace, create_if_missing) = match last_workspace {
        Some(workspace) => workspace,
        None => initial_workspace(&app)?,
    };
    start_runtime_async(app, workspace, create_if_missing);
    Ok(())
}

#[tauri::command]
fn local_control_status(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
) -> Result<LocalControlInfo, String> {
    require_bootstrap_origin(&webview)?;
    Ok(lock(&state.local_control)
        .as_ref()
        .map(LocalControlSession::info)
        .unwrap_or_else(LocalControlInfo::inactive))
}

#[tauri::command]
fn enable_local_control(
    webview: WebviewWindow,
    app: AppHandle,
) -> Result<LocalControlInfo, String> {
    require_bootstrap_origin(&webview)?;
    let state = app.state::<ApplicationState>();
    let mut local_control = lock(&state.local_control);
    if let Some(session) = local_control.as_ref() {
        return Ok(session.info());
    }
    let (runtime_url, runtime_token) = lock(&state.runtime)
        .as_ref()
        .map(|runtime| (runtime.base_url().clone(), runtime.token().to_string()))
        .ok_or_else(|| "Start a Desktop workspace before enabling Local Control.".to_string())?;
    let current_url = app
        .get_webview_window("main")
        .and_then(|window| window.url().ok())
        .filter(|url| is_same_origin(url, &runtime_url))
        .unwrap_or_else(|| runtime_url.clone());
    let session = LocalControlSession::start(&runtime_url, &runtime_token, &current_url)?;
    let info = session.info();
    *local_control = Some(session);
    set_local_control_menu_state(&app, true);
    let _ = app.emit("local-control-changed", &info);
    Ok(info)
}

#[tauri::command]
fn disable_local_control(webview: WebviewWindow, app: AppHandle) -> Result<(), String> {
    require_bootstrap_origin(&webview)?;
    stop_local_control(&app);
    Ok(())
}

#[tauri::command]
fn open_logs(webview: WebviewWindow, state: State<'_, ApplicationState>) -> Result<(), String> {
    require_bootstrap_origin(&webview)?;
    if let Some(parent) = state.log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create desktop log directory: {error}"))?;
    }
    if !state.log_path.exists() {
        fs::write(&state.log_path, b"")
            .map_err(|error| format!("Failed to create desktop log: {error}"))?;
    }
    open::that_detached(&state.log_path)
        .map_err(|error| format!("Failed to open desktop logs: {error}"))
}

#[tauri::command]
fn set_interface_zoom(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
    percent: u16,
) -> Result<(), String> {
    require_runtime_origin(&webview, &state)?;
    if !(50..=200).contains(&percent) {
        return Err("Zoom must be between 50 and 200 percent.".to_string());
    }
    webview
        .set_zoom(f64::from(percent) / 100.0)
        .map_err(|error| format!("Failed to set zoom: {error}"))
}

#[tauri::command]
fn read_openwork_client_state(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
) -> Result<OpenWorkClientState, String> {
    require_runtime_origin(&webview, &state)?;
    Ok(state.settings.openwork())
}

#[tauri::command]
fn write_openwork_client_state(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
    client_state: OpenWorkClientState,
) -> Result<(), String> {
    require_runtime_origin(&webview, &state)?;
    state.settings.set_openwork(client_state)
}

#[tauri::command]
async fn browser_open(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
    url: String,
) -> Result<(), String> {
    require_runtime_origin(&webview, &state)?;
    let url = parse_browser_url(&url)?;
    if let Some(browser) = webview.app_handle().get_webview("browser") {
        return browser
            .navigate(url)
            .map_err(|error| format!("Failed to navigate browser: {error}"));
    }
    let size = webview
        .inner_size()
        .map_err(|error| format!("Failed to read window size: {error}"))?;
    let scale = webview
        .scale_factor()
        .map_err(|error| format!("Failed to read display scale: {error}"))?;
    let logical = size.to_logical::<f64>(scale);
    let x = logical.width * 0.45;
    let mut builder = WebviewBuilder::new("browser", WebviewUrl::External(url))
        .on_navigation(|url| is_safe_browser_url(url))
        .on_new_window(|url, _| {
            if is_safe_browser_url(&url) {
                let _ = open::that_detached(url.as_str());
            }
            NewWindowResponse::Deny
        });
    if let Some(proxy) = resolve_proxy_url() {
        builder = builder.proxy_url(proxy);
    }
    webview
        .as_ref()
        .window()
        .add_child(
            builder,
            LogicalPosition::new(x, 48.0),
            LogicalSize::new(logical.width - x, (logical.height - 48.0).max(1.0)),
        )
        .map(|_| ())
        .map_err(|error| format!("Failed to open browser dock: {error}"))
}

#[tauri::command]
fn browser_set_bounds(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    require_runtime_origin(&webview, &state)?;
    let size = webview
        .inner_size()
        .map_err(|error| format!("Failed to read window size: {error}"))?;
    let scale = webview
        .scale_factor()
        .map_err(|error| format!("Failed to read display scale: {error}"))?;
    let logical = size.to_logical::<f64>(scale);
    if !browser_bounds_fit(x, y, width, height, logical.width, logical.height) {
        return Err("Invalid browser dock bounds.".to_string());
    }
    let browser = webview
        .app_handle()
        .get_webview("browser")
        .ok_or_else(|| "Browser dock is not open.".to_string())?;
    browser
        .set_position(LogicalPosition::new(x, y))
        .and_then(|_| browser.set_size(LogicalSize::new(width, height)))
        .map_err(|error| format!("Failed to resize browser dock: {error}"))
}

fn browser_bounds_fit(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    max_width: f64,
    max_height: f64,
) -> bool {
    [x, y, width, height, max_width, max_height]
        .iter()
        .all(|value| value.is_finite())
        && x >= 0.0
        && y >= 0.0
        && width >= 1.0
        && height >= 1.0
        && x + width <= max_width + 2.0
        && y + height <= max_height + 2.0
}

#[tauri::command]
fn browser_navigate(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
    action: String,
) -> Result<(), String> {
    require_runtime_origin(&webview, &state)?;
    let script = match action.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        _ => return Err("Unknown browser action.".to_string()),
    };
    webview
        .app_handle()
        .get_webview("browser")
        .ok_or_else(|| "Browser dock is not open.".to_string())?
        .eval(script)
        .map_err(|error| format!("Failed to control browser dock: {error}"))
}

#[tauri::command]
fn browser_close(webview: WebviewWindow, state: State<'_, ApplicationState>) -> Result<(), String> {
    require_runtime_origin(&webview, &state)?;
    close_browser_dock(webview.app_handle())
}

fn close_browser_dock(app: &AppHandle) -> Result<(), String> {
    match app.get_webview("browser") {
        Some(browser) => browser
            .close()
            .map_err(|error| format!("Failed to close browser dock: {error}")),
        None => Ok(()),
    }
}

#[tauri::command]
fn notify_turn_complete(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
    title: String,
    body: String,
) -> Result<(), String> {
    require_runtime_origin(&webview, &state)?;
    webview
        .app_handle()
        .notification()
        .builder()
        .title(title.chars().take(80).collect::<String>())
        .body(body.chars().take(240).collect::<String>())
        .show()
        .map_err(|error| format!("Failed to show notification: {error}"))
}

#[tauri::command]
fn proxy_status(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
) -> Result<String, String> {
    require_runtime_origin(&webview, &state)?;
    Ok(resolve_proxy_url()
        .map(|url| {
            format!(
                "Proxy: {}://{}",
                url.scheme(),
                url.host_str().unwrap_or("configured")
            )
        })
        .unwrap_or_else(|| "Direct connection".to_string()))
}

fn pets_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .home_dir()
        .map(|home| home.join(".qwen").join("pets"))
        .map_err(|error| format!("Failed to resolve desktop pets: {error}"))
}

fn load_pet(app: &AppHandle, id: &str) -> Result<(PetManifest, PathBuf), String> {
    load_pet_from_root(&pets_root(app)?, id)
}

fn load_pet_from_root(root: &Path, id: &str) -> Result<(PetManifest, PathBuf), String> {
    if !valid_pet_id(id) || id == "qwen" {
        return Err("Invalid custom desktop pet.".to_string());
    }
    let directory = root.join(id);
    let manifest: PetManifest = serde_json::from_str(
        &fs::read_to_string(directory.join("pet.json"))
            .map_err(|error| format!("Failed to read desktop pet {id}: {error}"))?,
    )
    .map_err(|error| format!("Invalid desktop pet {id}: {error}"))?;
    if manifest.id != id
        || !valid_pet_text(&manifest.display_name, 80)
        || !valid_pet_text(&manifest.description, 240)
    {
        return Err("Desktop pet manifest does not match its directory.".to_string());
    }
    let directory = fs::canonicalize(directory)
        .map_err(|error| format!("Failed to resolve desktop pet {id}: {error}"))?;
    let sprite = fs::canonicalize(directory.join(&manifest.spritesheet_path))
        .map_err(|error| format!("Failed to resolve desktop pet spritesheet: {error}"))?;
    if !sprite.starts_with(&directory) || !sprite.is_file() {
        return Err("Desktop pet spritesheet escapes its pet directory.".to_string());
    }
    Ok((manifest, sprite))
}

fn valid_pet_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max && !value.chars().any(char::is_control)
}

#[tauri::command]
fn list_pets(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
) -> Result<Vec<PetInfo>, String> {
    require_runtime_origin(&webview, &state)?;
    let app = webview.app_handle();
    let mut pets = fs::read_dir(pets_root(app)?)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().into_owned();
            let (manifest, _) = load_pet(app, &id).ok()?;
            Some(PetInfo {
                id,
                display_name: manifest.display_name,
                description: manifest.description,
            })
        })
        .collect::<Vec<_>>();
    pets.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    Ok(pets)
}

#[tauri::command]
fn resolve_pet_sprite(webview: WebviewWindow, pet_id: String) -> Result<Option<String>, String> {
    if webview.label() != "pet" {
        return Err("Desktop pet assets are available only to the pet window.".to_string());
    }
    if pet_id == "qwen" {
        return Ok(None);
    }
    load_pet(webview.app_handle(), &pet_id)
        .map(|(_, sprite)| Some(sprite.to_string_lossy().into_owned()))
}

fn open_pet(app: &AppHandle, pet_id: &str) -> Result<bool, String> {
    if pet_id != "qwen" {
        load_pet(app, pet_id)?;
    }
    let encoded = url::form_urlencoded::byte_serialize(pet_id.as_bytes()).collect::<String>();
    WebviewWindowBuilder::new(
        app,
        "pet",
        WebviewUrl::App(format!("pet.html?pet={encoded}").into()),
    )
    .title("OpenWork Pet")
    .inner_size(144.0, 156.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()
    .map(|_| true)
    .map_err(|error| format!("Failed to open desktop pet: {error}"))
}

#[tauri::command]
fn toggle_pet(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
    visible: Option<bool>,
    pet_id: Option<String>,
) -> Result<bool, String> {
    require_runtime_origin(&webview, &state)?;
    let app = webview.app_handle();
    if let Some(pet) = app.get_webview_window("pet") {
        if visible == Some(true) && pet_id.is_none() {
            return Ok(true);
        }
        pet.close()
            .map_err(|error| format!("Failed to close desktop pet: {error}"))?;
        if visible != Some(true) {
            return Ok(false);
        }
    }
    if visible == Some(false) {
        return Ok(false);
    }
    let selected = pet_id.unwrap_or_else(|| state.settings.openwork().pet_id);
    open_pet(app, &selected)
}

#[tauri::command]
async fn check_for_updates(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
) -> Result<Option<String>, String> {
    require_runtime_origin(&webview, &state)?;
    Ok(check_for_update(webview.app_handle())
        .await?
        .map(|update| update.version))
}

#[tauri::command]
async fn install_update(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
) -> Result<(), String> {
    require_runtime_origin(&webview, &state)?;
    let app = webview.app_handle().clone();
    let update = check_for_update(&app)
        .await?
        .ok_or_else(|| "OpenWork is already up to date".to_string())?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("Update installation failed: {error}"))?;
    app.restart()
}

async fn check_for_update(app: &AppHandle) -> Result<Option<Update>, String> {
    app.updater_builder()
        .timeout(UPDATE_CHECK_TIMEOUT)
        .build()
        .map_err(|error| format!("Updater unavailable: {error}"))?
        .check()
        .await
        .map_err(|error| format!("Update check failed: {error}"))
}

#[tauri::command]
fn take_pending_deep_links(
    webview: WebviewWindow,
    state: State<'_, ApplicationState>,
) -> Result<Vec<String>, String> {
    require_runtime_origin(&webview, &state)?;
    Ok(std::mem::take(&mut *lock(
        PENDING_DEEP_LINKS.get_or_init(|| Mutex::new(Vec::new())),
    )))
}

fn start_runtime_async(app: AppHandle, workspace: PathBuf, create_if_missing: bool) {
    stop_runtime(&app);
    let generation = {
        let state = app.state::<ApplicationState>();
        *lock(&state.last_workspace) = Some((workspace.clone(), create_if_missing));
        let generation = state.start_generation.fetch_add(1, Ordering::SeqCst) + 1;
        state.starting.store(generation, Ordering::SeqCst);
        generation
    };
    *lock(&app.state::<ApplicationState>().last_error) = None;
    let _ = app.emit("runtime-starting", workspace.to_string_lossy().into_owned());
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ApplicationState>();
        // Creating the default workspace touches ~/Documents, which can raise
        // the macOS TCC prompt, so it runs here (off the main thread) instead
        // of during setup.
        if create_if_missing {
            if let Err(error) = ensure_workspace_dir(&workspace) {
                emit_runtime_failure(&app, generation, error);
                return;
            }
        }
        let canonical = match resolve_workspace(&workspace) {
            Ok(path) => path,
            Err(error) => {
                emit_runtime_failure(&app, generation, error);
                return;
            }
        };
        if let Err(error) = state.settings.set_workspace(canonical.clone()) {
            emit_runtime_failure(&app, generation, error);
            return;
        }
        let registered = app.clone();
        match DesktopRuntime::start(&app, &canonical, &state.log_path, move |child, stopping| {
            let state = registered.state::<ApplicationState>();
            let pending = PendingRuntime {
                generation,
                child,
                stopping,
            };
            let mut slot = lock(&state.pending_runtime);
            if state.start_generation.load(Ordering::SeqCst) == generation {
                *slot = Some(pending);
            } else {
                drop(slot);
                pending.stop();
            }
        }) {
            Ok(runtime) => {
                if state.start_generation.load(Ordering::SeqCst) != generation {
                    runtime.stop();
                    clear_pending_runtime(&state, generation);
                    return;
                }
                let origin = match origin_of(runtime.base_url()) {
                    Ok(origin) => origin,
                    Err(error) => {
                        runtime.stop();
                        clear_pending_runtime(&state, generation);
                        emit_runtime_failure(&app, generation, error);
                        return;
                    }
                };
                *lock(&state.origin) = Some(origin);
                let Some(window) = app.get_webview_window("main") else {
                    runtime.stop();
                    clear_pending_runtime(&state, generation);
                    emit_runtime_failure(
                        &app,
                        generation,
                        "Desktop window is unavailable.".to_string(),
                    );
                    return;
                };
                if let Err(error) = window.navigate(runtime.authenticated_web_url()) {
                    runtime.stop();
                    clear_pending_runtime(&state, generation);
                    emit_runtime_failure(
                        &app,
                        generation,
                        format!("Failed to authenticate and load Web Shell: {error}"),
                    );
                    return;
                }
                let mut runtime_slot = lock(&state.runtime);
                if state.start_generation.load(Ordering::SeqCst) != generation {
                    drop(runtime_slot);
                    runtime.stop();
                    clear_pending_runtime(&state, generation);
                    return;
                }
                *runtime_slot = Some(runtime);
                // Register the runtime before its monitor can emit an exit event.
                runtime_slot
                    .as_ref()
                    .expect("runtime was just registered")
                    .monitor(&app);
                drop(runtime_slot);
                clear_pending_runtime(&state, generation);
                if state
                    .starting
                    .compare_exchange(generation, 0, Ordering::SeqCst, Ordering::SeqCst)
                    .is_ok()
                {
                    let _ = app.emit("runtime-ready", canonical.to_string_lossy().into_owned());
                }
            }
            Err(error) => {
                clear_pending_runtime(&state, generation);
                emit_runtime_failure(&app, generation, error);
            }
        }
    });
}

fn emit_runtime_failure(app: &AppHandle, generation: u64, error: String) {
    let state = app.state::<ApplicationState>();
    if state.start_generation.load(Ordering::SeqCst) != generation {
        return;
    }
    state
        .starting
        .compare_exchange(generation, 0, Ordering::SeqCst, Ordering::SeqCst)
        .ok();
    *lock(&state.origin) = None;
    *lock(&state.last_error) = Some(error.clone());
    let _ = navigate_to_bootstrap(app);
    let _ = app.emit("runtime-failed", error);
}

fn stop_runtime(app: &AppHandle) {
    let _ = close_browser_dock(app);
    stop_local_control(app);
    let state = app.state::<ApplicationState>();
    state.start_generation.fetch_add(1, Ordering::SeqCst);
    state.starting.store(0, Ordering::SeqCst);
    let runtime = lock(&state.runtime).take();
    if let Some(runtime) = runtime {
        runtime.stop();
    }
    // Kill any daemon still inside DesktopRuntime::start's startup wait.
    // Shares the child handle with a live runtime, so the take() inside
    // stop_runtime_handle keeps this idempotent.
    let pending = lock(&state.pending_runtime).take();
    if let Some(pending) = pending {
        pending.stop();
    }
}

fn clear_pending_runtime(state: &ApplicationState, generation: u64) {
    let mut pending = lock(&state.pending_runtime);
    if pending.as_ref().map(|runtime| runtime.generation) == Some(generation) {
        pending.take();
    }
}

fn stop_local_control(app: &AppHandle) {
    if let Some(mut session) = lock(&app.state::<ApplicationState>().local_control).take() {
        session.stop();
        set_local_control_menu_state(app, false);
        let _ = app.emit("local-control-changed", LocalControlInfo::inactive());
    }
}

fn set_local_control_menu_state(app: &AppHandle, active: bool) {
    let state = app.state::<ApplicationState>();
    let _ = state.local_control_menu.set_text(if active {
        "Local Control: On…"
    } else {
        "Local Control: Off…"
    });
    let _ = state.local_control_off_menu.set_enabled(active);
}

// Resolves the initial workspace and whether it is the derived first-launch
// default that must be created before starting the runtime. Path resolution
// only: directory creation happens off the main thread in start_runtime_async
// because the first touch of ~/Documents can trigger the macOS TCC prompt.
fn initial_workspace(app: &AppHandle) -> Result<(PathBuf, bool), String> {
    if let Some(workspace) = std::env::var_os("OPENWORK_DESKTOP_WORKSPACE") {
        return Ok((PathBuf::from(workspace), false));
    }
    if let Some(workspace) = app.state::<ApplicationState>().settings.workspace() {
        return Ok((workspace, false));
    }
    default_workspace(app)
}

fn default_workspace(app: &AppHandle) -> Result<(PathBuf, bool), String> {
    // Matches the Electron shell, where an empty override falls back to the
    // ~/Documents/OpenWork default.
    let override_dir =
        default_workspace_override_dir(std::env::var_os("OPENWORK_DEFAULT_WORKSPACE_DIR"));
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("Failed to resolve the home directory: {error}"))?;
    Ok((default_workspace_path(&home, override_dir.as_deref()), true))
}

// An empty override is treated as unset so the ~/Documents/OpenWork default wins,
// mirroring the Electron shell's `||` fallback.
fn default_workspace_override_dir(value: Option<OsString>) -> Option<PathBuf> {
    value
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

fn default_workspace_path(home: &Path, override_dir: Option<&Path>) -> PathBuf {
    match override_dir {
        Some(dir) => dir.to_path_buf(),
        None => home.join("Documents").join(DEFAULT_WORKSPACE_DIRECTORY),
    }
}

// Creates the default workspace directory. Kept separate from path
// resolution so it can run off the main thread and be tested on its own.
fn ensure_workspace_dir(workspace: &Path) -> Result<(), String> {
    fs::create_dir_all(workspace).map_err(|error| {
        format!(
            "Failed to create the default workspace {}: {error}",
            workspace.display()
        )
    })
}

fn desktop_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_log_dir()
        .map(|path| path.join("desktop-runtime.log"))
        .map_err(|error| format!("Failed to resolve desktop log directory: {error}"))
}

fn save_window_state(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = app
            .state::<ApplicationState>()
            .settings
            .save_window(&window);
    }
}

fn spawn_window_state_flusher(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(300));
        let state = app.state::<ApplicationState>();
        if state.window_dirty.swap(false, Ordering::Relaxed) {
            save_window_state(&app);
        }
    });
}

fn focus_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    cancel_pending_fullscreen_hide();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn cancel_pending_fullscreen_hide() {
    FULLSCREEN_HIDE_GENERATION.fetch_add(1, Ordering::AcqRel);
    FULLSCREEN_HIDE_PENDING.store(false, Ordering::Release);
}

#[cfg(target_os = "macos")]
fn take_pending_fullscreen_hide(generation: u64) -> bool {
    FULLSCREEN_HIDE_GENERATION.load(Ordering::Acquire) == generation
        && FULLSCREEN_HIDE_PENDING.swap(false, Ordering::AcqRel)
}

#[cfg(target_os = "macos")]
fn should_restore_main_window(has_visible_windows: bool, main_needs_restore: bool) -> bool {
    !has_visible_windows || main_needs_restore || FULLSCREEN_HIDE_PENDING.load(Ordering::Relaxed)
}

fn show_local_control_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("local-control") {
        window.center().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        "local-control",
        WebviewUrl::App("local-control.html".into()),
    )
    .title("OpenWork Local Control")
    .inner_size(440.0, 500.0)
    .min_inner_size(400.0, 500.0)
    .resizable(false)
    .center()
    .build()
    .map(|_| ())
    .map_err(|error| format!("Failed to open Local Control: {error}"))
}

fn navigate_to_bootstrap(app: &AppHandle) -> Result<(), String> {
    let url = Url::parse(BOOTSTRAP_URL)
        .map_err(|error| format!("Failed to construct bootstrap URL: {error}"))?;
    app.get_webview_window("main")
        .ok_or_else(|| "Desktop window is unavailable.".to_string())?
        .navigate(url)
        .map_err(|error| format!("Failed to show desktop recovery page: {error}"))
}

fn require_bootstrap_origin(webview: &WebviewWindow) -> Result<(), String> {
    let url = webview
        .url()
        .map_err(|error| format!("Failed to read calling webview URL: {error}"))?;
    if is_bootstrap_url(&url) {
        Ok(())
    } else {
        Err("This command is only available from the desktop shell.".to_string())
    }
}

fn require_runtime_origin(webview: &WebviewWindow, state: &ApplicationState) -> Result<(), String> {
    let url = webview
        .url()
        .map_err(|error| format!("Failed to read calling webview URL: {error}"))?;
    if lock(&state.origin)
        .as_ref()
        .is_some_and(|origin| is_same_origin(&url, origin))
    {
        Ok(())
    } else {
        Err("This command is only available to the active local runtime.".to_string())
    }
}

fn emit_deep_links<'a>(app: &AppHandle, values: impl Iterator<Item = &'a str>) {
    for value in values {
        let Ok(url) = Url::parse(value) else {
            continue;
        };
        if !is_safe_deep_link(&url) {
            continue;
        }
        let value = url.to_string();
        let mut pending = lock(PENDING_DEEP_LINKS.get_or_init(|| Mutex::new(Vec::new())));
        if pending.len() == 16 {
            pending.remove(0);
        }
        pending.push(value.clone());
        drop(pending);
        let _ = app.emit_to("main", "openwork-deep-link", value);
    }
}

fn is_safe_deep_link(url: &Url) -> bool {
    if url.scheme() != "openwork"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    match url.host_str() {
        Some("new") => matches!(url.path(), "" | "/"),
        Some("session") => url.path().strip_prefix('/').is_some_and(is_safe_session_id),
        _ => false,
    }
}

fn is_safe_session_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn parse_browser_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Browser URL is invalid.".to_string())?;
    if !is_safe_browser_url(&url) {
        return Err("Browser URLs must use HTTP(S) without embedded credentials.".to_string());
    }
    Ok(url)
}

fn is_safe_browser_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
}

fn resolve_proxy_url() -> Option<Url> {
    [
        "OPENWORK_PROXY",
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ]
    .into_iter()
    .filter_map(|key| std::env::var(key).ok())
    .find_map(|value| {
        Url::parse(value.trim()).ok().filter(|url| {
            matches!(url.scheme(), "http" | "https" | "socks5" | "socks5h")
                && url.host_str().is_some()
        })
    })
}

fn is_allowed_navigation(url: &Url, origin: &Mutex<Option<Url>>) -> bool {
    is_bootstrap_url(url)
        || lock(origin)
            .as_ref()
            .is_some_and(|allowed| is_same_origin(url, allowed))
}

fn is_bootstrap_url(url: &Url) -> bool {
    if cfg!(debug_assertions) {
        return url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(1420);
    }
    if url.scheme() == "tauri" && url.host_str() == Some("localhost") {
        return true;
    }
    cfg!(target_os = "windows")
        && matches!(url.scheme(), "http" | "https")
        && url.host_str() == Some("tauri.localhost")
}

fn origin_of(url: &Url) -> Result<Url, String> {
    let mut origin = url.clone();
    origin.set_path("/");
    origin.set_query(None);
    origin.set_fragment(None);
    if origin.scheme() != "http" || origin.host_str() != Some("127.0.0.1") {
        return Err(format!("Refusing non-loopback runtime URL: {origin}"));
    }
    Ok(origin)
}

fn is_same_origin(url: &Url, origin: &Url) -> bool {
    url.scheme() == origin.scheme()
        && url.host_str() == origin.host_str()
        && url.port_or_known_default() == origin.port_or_known_default()
}

fn is_safe_external_url(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http" | "mailto")
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        bootstrap_workspace, browser_bounds_fit, default_workspace_override_dir,
        default_workspace_path, ensure_workspace_dir, is_allowed_navigation, is_bootstrap_url,
        is_safe_deep_link, is_safe_external_url, is_same_origin, load_pet_from_root, origin_of,
        parse_browser_url, BOOTSTRAP_URL,
    };
    #[cfg(target_os = "macos")]
    use super::{
        cancel_pending_fullscreen_hide, should_restore_main_window, take_pending_fullscreen_hide,
        FULLSCREEN_HIDE_GENERATION, FULLSCREEN_HIDE_PENDING,
    };
    use std::ffi::OsString;
    use std::fs;
    use std::path::PathBuf;
    #[cfg(target_os = "macos")]
    use std::sync::atomic::Ordering;
    use std::sync::Mutex;
    use url::Url;

    #[test]
    fn bootstrap_prefers_the_workspace_being_started() {
        let attempted = PathBuf::from("/tmp/attempted");
        let persisted = PathBuf::from("/tmp/persisted");
        assert_eq!(
            bootstrap_workspace(Some((attempted.clone(), false)), Some(persisted.clone())),
            Some(attempted),
        );
        assert_eq!(
            bootstrap_workspace(None, Some(persisted.clone())),
            Some(persisted)
        );
        assert_eq!(
            bootstrap_workspace(Some((PathBuf::from("/tmp/first-launch"), true)), None),
            Some(PathBuf::from("/tmp/first-launch")),
        );
        assert_eq!(bootstrap_workspace(None, None), None);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn fullscreen_hide_lifecycle_state() {
        // has_visible, main_needs_restore, FULLSCREEN_PENDING → expected
        let cases: &[(bool, bool, bool, bool)] = &[
            (true, false, false, false),
            (true, false, true, true),
            (true, true, false, true),
            (true, true, true, true),
            (false, false, false, true),
            (false, false, true, true),
            (false, true, false, true),
            (false, true, true, true),
        ];
        for (has_visible, needs_restore, pending, expected) in cases {
            FULLSCREEN_HIDE_PENDING.store(*pending, Ordering::Relaxed);
            assert_eq!(
                should_restore_main_window(*has_visible, *needs_restore),
                *expected,
                "has_visible={}, needs_restore={}, pending={}",
                has_visible,
                needs_restore,
                pending,
            );
        }
        FULLSCREEN_HIDE_PENDING.store(false, Ordering::Relaxed);

        FULLSCREEN_HIDE_GENERATION.store(0, Ordering::Relaxed);
        let first_hide = FULLSCREEN_HIDE_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
        FULLSCREEN_HIDE_PENDING.store(true, Ordering::Release);
        cancel_pending_fullscreen_hide();
        let second_hide = FULLSCREEN_HIDE_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
        FULLSCREEN_HIDE_PENDING.store(true, Ordering::Release);
        assert!(!take_pending_fullscreen_hide(first_hide));
        assert!(FULLSCREEN_HIDE_PENDING.load(Ordering::Relaxed));
        assert!(take_pending_fullscreen_hide(second_hide));
    }

    #[test]
    fn allows_only_the_daemon_origin_in_the_main_window() {
        let origin = Url::parse("http://127.0.0.1:49152/").expect("origin");
        assert!(is_same_origin(
            &Url::parse("http://127.0.0.1:49152/session/123").expect("same origin"),
            &origin,
        ));
        assert!(!is_same_origin(
            &Url::parse("http://127.0.0.1:49153/").expect("different port"),
            &origin,
        ));
        assert!(!is_same_origin(
            &Url::parse("https://example.com/").expect("external"),
            &origin,
        ));
    }

    #[test]
    fn creates_and_reuses_the_default_workspace() {
        let home = std::env::temp_dir().join(format!(
            "openwork-desktop-default-workspace-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&home);

        let workspace = default_workspace_path(&home, None);
        assert_eq!(workspace, home.join("Documents/OpenWork"));
        ensure_workspace_dir(&workspace).expect("create workspace");
        ensure_workspace_dir(&workspace).expect("reuse workspace");

        assert!(workspace.is_dir());
        fs::remove_dir_all(home).expect("cleanup");
    }

    #[test]
    fn reports_an_uncreatable_default_workspace() {
        let home = std::env::temp_dir().join(format!(
            "openwork-desktop-default-workspace-error-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&home);
        fs::create_dir_all(&home).expect("create home");
        fs::write(home.join("Documents"), b"not a directory").expect("block Documents");

        let workspace = default_workspace_path(&home, None);
        assert!(ensure_workspace_dir(&workspace).is_err());
        fs::remove_dir_all(home).expect("cleanup");
    }

    #[test]
    fn treats_an_unset_or_empty_workspace_override_as_absent() {
        assert_eq!(default_workspace_override_dir(None), None);
        assert_eq!(default_workspace_override_dir(Some(OsString::new())), None);
    }

    #[test]
    fn uses_a_non_empty_workspace_override_verbatim() {
        let custom = PathBuf::from("/tmp/qwen-custom-workspace");
        assert_eq!(
            default_workspace_override_dir(Some(OsString::from(custom.clone()))),
            Some(custom)
        );
    }

    #[test]
    fn honors_the_default_workspace_directory_override() {
        let home = std::env::temp_dir().join(format!(
            "openwork-desktop-default-workspace-override-home-{}",
            std::process::id()
        ));
        let custom = std::env::temp_dir().join(format!(
            "openwork-desktop-default-workspace-override-target-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&home);
        let _ = fs::remove_dir_all(&custom);
        fs::create_dir_all(&home).expect("create home");

        let workspace = default_workspace_path(&home, Some(&custom));
        assert_eq!(workspace, custom);
        ensure_workspace_dir(&workspace).expect("create override workspace");

        assert!(custom.is_dir());
        assert!(!home.join("Documents").exists());
        fs::remove_dir_all(home).expect("cleanup home");
        fs::remove_dir_all(custom).expect("cleanup override");
    }

    #[test]
    fn allows_platform_bootstrap_origins() {
        if cfg!(debug_assertions) {
            assert!(is_bootstrap_url(
                &Url::parse("http://127.0.0.1:1420/").expect("development bootstrap")
            ));
            assert!(!is_bootstrap_url(
                &Url::parse("http://127.0.0.1:1421/").expect("wrong development port")
            ));
        } else {
            assert!(is_bootstrap_url(
                &Url::parse("tauri://localhost/").expect("tauri bootstrap")
            ));
            if cfg!(target_os = "windows") {
                assert!(is_bootstrap_url(
                    &Url::parse("http://tauri.localhost/").expect("windows bootstrap")
                ));
            } else {
                assert!(!is_bootstrap_url(
                    &Url::parse("http://tauri.localhost/").expect("not a bootstrap origin")
                ));
            }
        }
    }

    #[test]
    fn recovery_uses_the_platform_bootstrap_origin() {
        let expected = if cfg!(debug_assertions) {
            "http://127.0.0.1:1420"
        } else if cfg!(windows) {
            "http://tauri.localhost"
        } else {
            "tauri://localhost"
        };
        assert_eq!(BOOTSTRAP_URL, expected);
    }

    #[test]
    fn rejects_non_loopback_runtime_origins() {
        let error = origin_of(&Url::parse("http://0.0.0.0:4170/").expect("url"))
            .expect_err("non-loopback origin");
        assert!(error.contains("non-loopback"));
    }

    #[test]
    fn new_windows_allow_only_browser_safe_schemes() {
        assert!(is_safe_external_url(
            &Url::parse("https://qwen.ai/").expect("https")
        ));
        assert!(is_safe_external_url(
            &Url::parse("mailto:test@example.com").expect("mailto")
        ));
        assert!(!is_safe_external_url(
            &Url::parse("file:///etc/passwd").expect("file")
        ));
        assert!(!is_safe_external_url(
            &Url::parse("javascript:alert(1)").expect("javascript")
        ));
    }

    #[test]
    fn validates_desktop_external_inputs() {
        assert!(is_safe_deep_link(
            &Url::parse("openwork://session/123e4567-e89b-12d3-a456-426614174000")
                .expect("session link")
        ));
        assert!(is_safe_deep_link(
            &Url::parse("openwork://new").expect("new link")
        ));
        for value in [
            "openwork://session/one/two",
            "openwork://session/id?token=secret",
            "openwork://unknown/id",
            "https://session/id",
        ] {
            assert!(!is_safe_deep_link(
                &Url::parse(value).expect("invalid link")
            ));
        }
        assert!(parse_browser_url("https://example.com/path").is_ok());
        assert!(parse_browser_url("https://user:secret@example.com").is_err());
        assert!(parse_browser_url("file:///etc/passwd").is_err());
        assert!(browser_bounds_fit(450.0, 48.0, 550.0, 752.0, 1000.0, 800.0));
        assert!(!browser_bounds_fit(-1.0, 48.0, 550.0, 752.0, 1000.0, 800.0));
        assert!(!browser_bounds_fit(
            450.0, 48.0, 700.0, 752.0, 1000.0, 800.0
        ));
    }

    #[test]
    fn desktop_pet_sprites_stay_inside_their_manifest_directory() {
        let root =
            std::env::temp_dir().join(format!("openwork-desktop-pet-test-{}", std::process::id()));
        let pet = root.join("helper");
        fs::create_dir_all(&pet).expect("create pet directory");
        fs::write(pet.join("spritesheet.webp"), b"image").expect("write sprite");
        fs::write(
            pet.join("pet.json"),
            r#"{"id":"helper","displayName":"Helper","description":"A test pet","spritesheetPath":"spritesheet.webp"}"#,
        )
        .expect("write pet manifest");
        let (_, sprite) = load_pet_from_root(&root, "helper").expect("valid pet");
        assert_eq!(
            sprite,
            fs::canonicalize(pet.join("spritesheet.webp")).unwrap()
        );

        fs::write(root.join("outside.webp"), b"outside").expect("write outside sprite");
        fs::write(
            pet.join("pet.json"),
            r#"{"id":"helper","displayName":"Helper","description":"A test pet","spritesheetPath":"../outside.webp"}"#,
        )
        .expect("write traversal manifest");
        assert!(load_pet_from_root(&root, "helper").is_err());
        fs::remove_dir_all(root).expect("cleanup pet fixture");
    }

    #[test]
    fn allows_bootstrap_but_not_a_runtime_url_before_origin_is_set() {
        let origin = Mutex::new(None);
        assert!(is_allowed_navigation(
            &Url::parse(BOOTSTRAP_URL).expect("bootstrap"),
            &origin,
        ));
        assert!(!is_allowed_navigation(
            &Url::parse("http://127.0.0.1:49152/").expect("runtime"),
            &origin,
        ));
    }

    #[test]
    fn allows_only_the_recorded_origin_once_it_is_set() {
        let origin = Mutex::new(Some(Url::parse("http://127.0.0.1:49152/").expect("origin")));
        assert!(is_allowed_navigation(
            &Url::parse("http://127.0.0.1:49152/session/123").expect("same origin"),
            &origin,
        ));
        assert!(!is_allowed_navigation(
            &Url::parse("http://127.0.0.1:49153/").expect("different port"),
            &origin,
        ));
        assert!(!is_allowed_navigation(
            &Url::parse("https://example.com/").expect("external"),
            &origin,
        ));
    }

    #[test]
    fn allows_bootstrap_even_after_origin_is_set() {
        let origin = Mutex::new(Some(Url::parse("http://127.0.0.1:49152/").expect("origin")));
        assert!(is_allowed_navigation(
            &Url::parse(BOOTSTRAP_URL).expect("bootstrap"),
            &origin,
        ));
    }

    #[test]
    fn command_origin_gate_accepts_only_bootstrap() {
        assert!(is_bootstrap_url(
            &Url::parse(BOOTSTRAP_URL).expect("bootstrap")
        ));
        assert!(!is_bootstrap_url(
            &Url::parse("http://127.0.0.1:49152/").expect("runtime")
        ));
        assert!(!is_bootstrap_url(
            &Url::parse("https://example.com/").expect("external")
        ));
    }
}
