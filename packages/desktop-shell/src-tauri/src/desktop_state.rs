use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

const DEFAULT_WIDTH: u32 = 1280;
const DEFAULT_HEIGHT: u32 = 820;
const MIN_WIDTH: u32 = 900;
const MIN_HEIGHT: u32 = 600;
const DISABLE_SETTINGS_PERSISTENCE_ENV: &str = "OPENWORK_DESKTOP_DISABLE_SETTINGS_PERSISTENCE";
static NEXT_WRITE_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct DesktopSettings {
    pub workspace: Option<PathBuf>,
    pub window: Option<WindowState>,
    pub openwork: OpenWorkClientState,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OpenWorkPreferences {
    pub preset_theme: String,
    pub zoom: u16,
    pub text_scale: f64,
    pub high_contrast: bool,
    pub reduce_motion: bool,
    pub keep_awake: bool,
}

impl Default for OpenWorkPreferences {
    fn default() -> Self {
        Self {
            preset_theme: "default".to_string(),
            zoom: 100,
            text_scale: 1.0,
            high_contrast: false,
            reduce_motion: false,
            keep_awake: true,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWorkRecentSession {
    pub id: String,
    pub workspace_id: Option<String>,
    pub visited_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OpenWorkClientState {
    pub preferences: OpenWorkPreferences,
    pub chat_width: String,
    pub theme: Option<String>,
    pub language: Option<String>,
    pub recent_commands: Vec<String>,
    pub recent_sessions: Vec<OpenWorkRecentSession>,
    pub pet_enabled: bool,
    pub pet_id: String,
}

impl Default for OpenWorkClientState {
    fn default() -> Self {
        Self {
            preferences: OpenWorkPreferences::default(),
            chat_width: "1100".to_string(),
            theme: None,
            language: None,
            recent_commands: Vec::new(),
            recent_sessions: Vec::new(),
            pet_enabled: false,
            pet_id: "qwen".to_string(),
        }
    }
}

impl OpenWorkClientState {
    fn validate(&self) -> Result<(), String> {
        if !valid_openwork_theme(&self.preferences.preset_theme)
            || ![50, 67, 80, 90, 100, 110, 125, 150, 175, 200].contains(&self.preferences.zoom)
            || ![0.9, 1.0, 1.15].contains(&self.preferences.text_scale)
            || !matches!(self.chat_width.as_str(), "840" | "1100" | "wide")
            || !self
                .theme
                .as_deref()
                .map_or(true, |theme| matches!(theme, "dark" | "light"))
            || !self.language.as_deref().map_or(true, |language| {
                matches!(language, "en" | "de" | "es" | "hu" | "ja" | "pl" | "zh-CN")
            })
        {
            return Err("Invalid OpenWork appearance preferences.".to_string());
        }
        if self.recent_commands.len() > 6
            || self.recent_commands.iter().any(|command| {
                command.is_empty() || command.len() > 64 || command.chars().any(char::is_control)
            })
        {
            return Err("Invalid OpenWork recent commands.".to_string());
        }
        if !valid_pet_id(&self.pet_id) {
            return Err("Invalid OpenWork desktop pet.".to_string());
        }
        if self.recent_sessions.len() > 6
            || self.recent_sessions.iter().any(|session| {
                session.id.is_empty()
                    || session.id.len() > 128
                    || !session.id.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')
                    })
                    || session.workspace_id.as_ref().is_some_and(|workspace_id| {
                        workspace_id.len() > 256 || workspace_id.chars().any(char::is_control)
                    })
            })
        {
            return Err("Invalid OpenWork recent sessions.".to_string());
        }
        Ok(())
    }
}

pub(crate) fn valid_pet_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub maximized: bool,
}

pub struct SettingsStore {
    path: PathBuf,
    settings: Mutex<DesktopSettings>,
}

impl SettingsStore {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let path = settings_path(app)?;
        let settings = match fs::read_to_string(&path) {
            Ok(contents) => parse_settings(&contents),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                legacy_desktop_settings(app)?.unwrap_or_default()
            }
            Err(error) => return Err(format!("Failed to read desktop settings: {error}")),
        };
        Ok(Self {
            path,
            settings: Mutex::new(settings),
        })
    }

    pub fn workspace(&self) -> Option<PathBuf> {
        self.with_settings(|settings| settings.workspace.clone())
    }

    pub fn set_workspace(&self, workspace: PathBuf) -> Result<(), String> {
        self.update(|settings| settings.workspace = Some(workspace))
    }

    pub fn window(&self) -> Option<WindowState> {
        self.with_settings(|settings| settings.window.clone())
    }

    pub fn openwork(&self) -> OpenWorkClientState {
        self.with_settings(|settings| settings.openwork.clone())
    }

    pub fn set_openwork(&self, openwork: OpenWorkClientState) -> Result<(), String> {
        openwork.validate()?;
        self.update(|settings| settings.openwork = openwork)
    }

    pub fn save_window(&self, window: &WebviewWindow) -> Result<(), String> {
        let position = window
            .outer_position()
            .map_err(|error| format!("Failed to read window position: {error}"))?;
        let size = window
            .inner_size()
            .map_err(|error| format!("Failed to read window size: {error}"))?;
        let maximized = window
            .is_maximized()
            .map_err(|error| format!("Failed to read window maximized state: {error}"))?;
        self.update(|settings| {
            settings.window = Some(saved_window_state(
                settings.window.as_ref(),
                position,
                size,
                maximized,
            ));
        })
    }

    fn update(&self, update: impl FnOnce(&mut DesktopSettings)) -> Result<(), String> {
        if settings_persistence_disabled() {
            return Ok(());
        }
        let mut settings = match self.settings.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        update(&mut settings);
        let serialized = serde_json::to_string_pretty(&*settings)
            .map_err(|error| format!("Failed to serialize desktop settings: {error}"))?;
        write_atomic(&self.path, format!("{serialized}\n").as_bytes())
    }

    fn with_settings<T>(&self, read: impl FnOnce(&DesktopSettings) -> T) -> T {
        let settings = match self.settings.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        read(&settings)
    }
}

fn valid_openwork_theme(value: &str) -> bool {
    [
        "catppuccin",
        "default",
        "dracula",
        "ghostty",
        "github",
        "gruvbox",
        "haze",
        "night-owl",
        "nord",
        "one-dark-pro",
        "pierre",
        "rose-pine",
        "solarized",
        "tokyo-night",
        "vitesse",
    ]
    .contains(&value)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyConfig {
    active_workspace_id: Option<String>,
    #[serde(default)]
    workspaces: Vec<LegacyWorkspace>,
    color_theme: Option<String>,
    keep_awake_while_running: Option<bool>,
    pet_enabled: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyWorkspace {
    id: String,
    root_path: PathBuf,
}

#[derive(Default, Deserialize)]
struct LegacyWorkspaceConfig {
    #[serde(default)]
    defaults: LegacyWorkspaceDefaults,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyWorkspaceDefaults {
    working_directory: Option<PathBuf>,
}

fn legacy_desktop_settings(app: &AppHandle) -> Result<Option<DesktopSettings>, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("Failed to locate the home directory: {error}"))?;
    let legacy_root = std::env::var_os("OPENWORK_LEGACY_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".craft-agent"));
    legacy_desktop_settings_from(&legacy_root, &home)
}

fn read_legacy_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Failed to read legacy desktop settings at {}: {error}",
                path.display()
            ))
        }
    };
    serde_json::from_str(&contents).map(Some).map_err(|error| {
        format!(
            "Failed to parse legacy desktop settings at {}: {error}",
            path.display()
        )
    })
}

fn legacy_desktop_settings_from(
    legacy_root: &Path,
    home: &Path,
) -> Result<Option<DesktopSettings>, String> {
    let Some(config) = read_legacy_json::<LegacyConfig>(&legacy_root.join("config.json"))? else {
        return Ok(None);
    };
    let selected_workspace = config
        .active_workspace_id
        .as_deref()
        .and_then(|id| {
            config
                .workspaces
                .iter()
                .find(|workspace| workspace.id == id)
        })
        .or_else(|| config.workspaces.first());
    let workspace = match selected_workspace {
        Some(workspace) => {
            let root = expand_legacy_path(&workspace.root_path, home, legacy_root);
            let workspace_config =
                read_legacy_json::<LegacyWorkspaceConfig>(&root.join("config.json"))?
                    .unwrap_or_default();
            let working_directory = workspace_config
                .defaults
                .working_directory
                .map(|path| expand_legacy_path(&path, home, &root))
                .unwrap_or_else(|| root.clone());
            match fs::metadata(&working_directory) {
                Ok(metadata) if metadata.is_dir() => Some(working_directory),
                Ok(_) => None,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => {
                    return Err(format!(
                        "Failed to inspect legacy workspace at {}: {error}",
                        working_directory.display()
                    ))
                }
            }
        }
        None => None,
    };
    let mut settings = DesktopSettings {
        workspace,
        ..DesktopSettings::default()
    };
    if let Some(theme) = config
        .color_theme
        .filter(|theme| valid_openwork_theme(theme))
    {
        settings.openwork.preferences.preset_theme = theme;
    }
    if let Some(keep_awake) = config.keep_awake_while_running {
        settings.openwork.preferences.keep_awake = keep_awake;
    }
    if let Some(pet_enabled) = config.pet_enabled {
        settings.openwork.pet_enabled = pet_enabled;
    }
    Ok(Some(settings))
}

fn expand_legacy_path(value: &Path, home: &Path, base: &Path) -> PathBuf {
    let value = value.to_string_lossy();
    if value == "~" {
        return home.to_path_buf();
    }
    if let Some(relative) = value
        .strip_prefix("~/")
        .or_else(|| value.strip_prefix("~\\"))
    {
        return home.join(relative);
    }
    let expanded = value.replace("${HOME}", &home.to_string_lossy());
    let path = PathBuf::from(expanded);
    if path.is_absolute() {
        path
    } else {
        base.join(path)
    }
}

fn settings_persistence_disabled() -> bool {
    settings_persistence_disabled_value(
        std::env::var_os(DISABLE_SETTINGS_PERSISTENCE_ENV).as_deref(),
    )
}

fn settings_persistence_disabled_value(value: Option<&OsStr>) -> bool {
    value == Some(OsStr::new("1"))
}

pub fn restore_window(window: &WebviewWindow, state: Option<&WindowState>) {
    let Some(state) = state else {
        let _ = window.center();
        return;
    };
    let size = PhysicalSize::new(state.width.max(MIN_WIDTH), state.height.max(MIN_HEIGHT));
    let _ = window.set_size(size);
    if window
        .monitor_from_point(f64::from(state.x), f64::from(state.y))
        .ok()
        .flatten()
        .is_some()
    {
        let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
    } else {
        let _ = window.center();
    }
    if state.maximized {
        let _ = window.maximize();
    }
}

pub fn default_window_size() -> (f64, f64) {
    (f64::from(DEFAULT_WIDTH), f64::from(DEFAULT_HEIGHT))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("desktop-state.json"))
        .map_err(|error| format!("Failed to resolve desktop settings directory: {error}"))
}

fn parse_settings(contents: &str) -> DesktopSettings {
    serde_json::from_str(contents).unwrap_or_default()
}

fn saved_window_state(
    previous: Option<&WindowState>,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    maximized: bool,
) -> WindowState {
    if maximized {
        if let Some(previous) = previous {
            return WindowState {
                maximized: true,
                ..previous.clone()
            };
        }
        return WindowState {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            x: position.x,
            y: position.y,
            maximized: true,
        };
    }
    WindowState {
        width: size.width.max(MIN_WIDTH),
        height: size.height.max(MIN_HEIGHT),
        x: position.x,
        y: position.y,
        maximized,
    }
}

fn write_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Desktop settings path has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create desktop settings directory: {error}"))?;
    let temporary = path.with_extension(format!(
        "json.{}.tmp",
        NEXT_WRITE_ID.fetch_add(1, Ordering::Relaxed)
    ));
    fs::write(&temporary, contents)
        .map_err(|error| format!("Failed to write desktop settings: {error}"))?;
    if let Err(error) = fs::rename(&temporary, path) {
        if cfg!(windows) && path.exists() {
            let backup = path.with_extension(format!(
                "json.{}.bak",
                NEXT_WRITE_ID.fetch_add(1, Ordering::Relaxed)
            ));
            fs::rename(path, &backup).map_err(|backup_error| {
                format!("Failed to prepare desktop settings replacement: {backup_error}")
            })?;
            if let Err(rename_error) = fs::rename(&temporary, path) {
                let _ = fs::rename(&backup, path);
                return Err(format!(
                    "Failed to replace desktop settings: {rename_error}"
                ));
            }
            let _ = fs::remove_file(backup);
        } else {
            return Err(format!("Failed to replace desktop settings: {error}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        legacy_desktop_settings_from, parse_settings, saved_window_state,
        settings_persistence_disabled_value, write_atomic, DesktopSettings, OpenWorkClientState,
        WindowState,
    };
    use std::ffi::OsStr;
    use std::fs;
    use tauri::{PhysicalPosition, PhysicalSize};

    #[test]
    fn settings_remain_backward_compatible_when_fields_are_missing() {
        let settings: DesktopSettings = serde_json::from_str("{}").expect("settings");
        assert!(settings.workspace.is_none());
        assert!(settings.window.is_none());
        assert_eq!(settings.openwork.preferences.zoom, 100);
        assert!(settings.openwork.preferences.keep_awake);
    }

    #[test]
    fn validates_persisted_openwork_client_state() {
        let mut state = OpenWorkClientState::default();
        state.preferences.zoom = 125;
        assert!(state.validate().is_ok());
        state.recent_commands = (0..7).map(|index| format!("command-{index}")).collect();
        assert!(state.validate().is_err());
    }

    #[test]
    fn imports_legacy_workspace_and_preferences_without_moving_credentials() {
        let home =
            std::env::temp_dir().join(format!("openwork-legacy-settings-{}", std::process::id()));
        let legacy = home.join(".craft-agent");
        let workspace = home.join("Documents").join("OpenWork Legacy");
        let project = home.join("project");
        fs::create_dir_all(&workspace).expect("create workspace");
        fs::create_dir_all(&project).expect("create project");
        fs::create_dir_all(&legacy).expect("create legacy config");
        fs::write(
            legacy.join("config.json"),
            serde_json::to_vec(&serde_json::json!({
                "activeWorkspaceId": "legacy",
                "workspaces": [{"id": "legacy", "rootPath": workspace}],
                "colorTheme": "nord",
                "keepAwakeWhileRunning": false,
                "petEnabled": true
            }))
            .expect("serialize legacy config"),
        )
        .expect("write legacy config");
        fs::write(
            workspace.join("config.json"),
            r#"{"defaults":{"workingDirectory":"${HOME}/project"}}"#,
        )
        .expect("write workspace config");

        let settings = legacy_desktop_settings_from(&legacy, &home)
            .expect("read legacy settings")
            .expect("legacy settings");
        assert_eq!(settings.workspace.as_deref(), Some(project.as_path()));
        assert_eq!(settings.openwork.preferences.preset_theme, "nord");
        assert!(!settings.openwork.preferences.keep_awake);
        assert!(settings.openwork.pet_enabled);
        assert!(!home.join(".qwen").exists());
        fs::remove_dir_all(home).expect("cleanup legacy fixture");
    }

    #[test]
    fn rejects_malformed_legacy_settings() {
        let home = std::env::temp_dir().join(format!(
            "openwork-malformed-legacy-settings-{}",
            std::process::id()
        ));
        let legacy = home.join(".craft-agent");
        fs::create_dir_all(&legacy).expect("create legacy config");
        fs::write(legacy.join("config.json"), "{").expect("write malformed config");

        assert!(legacy_desktop_settings_from(&legacy, &home).is_err());
        fs::remove_dir_all(home).expect("cleanup legacy fixture");
    }

    #[cfg(unix)]
    #[test]
    fn reports_legacy_workspace_metadata_errors() {
        use std::os::unix::fs::symlink;

        let home = std::env::temp_dir().join(format!(
            "openwork-invalid-legacy-workspace-{}",
            std::process::id()
        ));
        let legacy = home.join(".craft-agent");
        let workspace = home.join("workspace");
        let loop_path = workspace.join("loop");
        fs::create_dir_all(&legacy).expect("create legacy config");
        fs::create_dir_all(&workspace).expect("create workspace");
        symlink("loop", &loop_path).expect("create symlink loop");
        fs::write(
            legacy.join("config.json"),
            serde_json::to_vec(&serde_json::json!({
                "workspaces": [{"id": "legacy", "rootPath": workspace}]
            }))
            .expect("serialize legacy config"),
        )
        .expect("write legacy config");
        fs::write(
            workspace.join("config.json"),
            serde_json::to_vec(&serde_json::json!({
                "defaults": {"workingDirectory": loop_path}
            }))
            .expect("serialize workspace config"),
        )
        .expect("write workspace config");

        assert!(legacy_desktop_settings_from(&legacy, &home).is_err());
        fs::remove_dir_all(home).expect("cleanup legacy fixture");
    }

    #[test]
    fn corrupt_settings_fall_back_to_defaults() {
        let settings = parse_settings("{");
        assert!(settings.workspace.is_none());
        assert!(settings.window.is_none());
    }

    #[test]
    fn window_state_round_trips() {
        let state = WindowState {
            width: 1200,
            height: 800,
            x: 20,
            y: 40,
            maximized: true,
        };
        let json = serde_json::to_string(&state).expect("serialize");
        let restored: WindowState = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(restored.width, 1200);
        assert!(restored.maximized);
    }

    #[test]
    fn maximized_save_preserves_previous_normal_bounds() {
        let previous = WindowState {
            width: 1000,
            height: 700,
            x: 10,
            y: 20,
            maximized: false,
        };
        let state = saved_window_state(
            Some(&previous),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1080),
            true,
        );
        assert_eq!(state.width, 1000);
        assert_eq!(state.height, 700);
        assert_eq!(state.x, 10);
        assert_eq!(state.y, 20);
        assert!(state.maximized);
    }

    #[test]
    fn maximized_first_save_uses_default_normal_size() {
        let state = saved_window_state(
            None,
            PhysicalPosition::new(40, 50),
            PhysicalSize::new(2560, 1440),
            true,
        );
        assert_eq!(state.width, 1280);
        assert_eq!(state.height, 820);
        assert_eq!(state.x, 40);
        assert_eq!(state.y, 50);
        assert!(state.maximized);
    }

    #[test]
    fn atomic_write_replaces_existing_contents() {
        let root =
            std::env::temp_dir().join(format!("openwork-desktop-state-{}", std::process::id()));
        let path = root.join("desktop-state.json");
        write_atomic(&path, b"first").expect("first write");
        write_atomic(&path, b"second").expect("second write");
        assert_eq!(fs::read_to_string(&path).expect("read"), "second");
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn smoke_can_disable_settings_persistence() {
        assert!(settings_persistence_disabled_value(Some(OsStr::new("1"))));
        assert!(!settings_persistence_disabled_value(Some(OsStr::new("0"))));
        assert!(!settings_persistence_disabled_value(None));
    }
}
