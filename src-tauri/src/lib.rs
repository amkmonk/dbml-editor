use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::Engine;
use serde::Serialize;
use tauri::WebviewWindow;
use tauri_plugin_dialog::{DialogExt, FilePath, MessageDialogButtons, MessageDialogKind};

/// Ответ при попытке перезаписать файл, который поменяли на диске после открытия.
const FILE_CHANGED: &str = "FILE_CHANGED";

#[derive(Serialize)]
struct OpenedFile {
  path: String,
  name: String,
  text: String,
  modified: Option<u64>,
}

#[derive(Serialize)]
struct SavedFile {
  path: String,
  name: String,
  modified: Option<u64>,
}

fn file_name(path: &Path) -> String {
  path
    .file_name()
    .map(|name| name.to_string_lossy().into_owned())
    .unwrap_or_default()
}

/// Время изменения в миллисекундах; None, если файла нет или ОС его не отдаёт.
fn modified_ms(path: &Path) -> Option<u64> {
  let time = fs::metadata(path).ok()?.modified().ok()?;
  Some(time.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

fn describe(path: &Path, error: std::io::Error) -> String {
  format!("{}: {error}", path.display())
}

fn read_dbml(path: PathBuf) -> Result<OpenedFile, String> {
  let text = fs::read_to_string(&path).map_err(|error| describe(&path, error))?;
  Ok(OpenedFile {
    name: file_name(&path),
    modified: modified_ms(&path),
    path: path.to_string_lossy().into_owned(),
    text,
  })
}

fn write_bytes(path: PathBuf, bytes: &[u8]) -> Result<SavedFile, String> {
  fs::write(&path, bytes).map_err(|error| describe(&path, error))?;
  Ok(SavedFile {
    name: file_name(&path),
    modified: modified_ms(&path),
    path: path.to_string_lossy().into_owned(),
  })
}

fn into_path(file: FilePath) -> Result<PathBuf, String> {
  file.into_path().map_err(|error| error.to_string())
}

/// Файл, переданный первым аргументом: «Открыть с помощью» или двойной клик по `.dbml`.
#[tauri::command]
fn launch_file() -> Result<Option<OpenedFile>, String> {
  let Some(arg) = std::env::args_os().nth(1) else {
    return Ok(None);
  };
  let path = PathBuf::from(arg);
  if !path.is_file() {
    return Ok(None);
  }
  read_dbml(path).map(Some)
}

#[tauri::command]
async fn open_file(window: WebviewWindow) -> Result<Option<OpenedFile>, String> {
  let picked = window
    .dialog()
    .file()
    .set_parent(&window)
    .add_filter("DBML", &["dbml", "txt"])
    .blocking_pick_file();
  match picked {
    Some(file) => read_dbml(into_path(file)?).map(Some),
    None => Ok(None),
  }
}

/// Перезапись открытого файла. Если на диске он новее `modified`, отвечает FILE_CHANGED, пока не передан `force`.
#[tauri::command]
fn save_file(path: String, text: String, modified: Option<u64>, force: bool) -> Result<SavedFile, String> {
  let path = PathBuf::from(path);
  if !force {
    if let (Some(seen), Some(current)) = (modified, modified_ms(&path)) {
      if current != seen {
        return Err(FILE_CHANGED.into());
      }
    }
  }
  write_bytes(path, text.as_bytes())
}

/// Диалог «Сохранить как». `data` — текст или base64 (для PNG).
#[tauri::command]
async fn save_file_as(
  window: WebviewWindow,
  name: String,
  extension: String,
  data: String,
  base64: bool,
) -> Result<Option<SavedFile>, String> {
  let picked = window
    .dialog()
    .file()
    .set_parent(&window)
    .set_file_name(&name)
    .add_filter(extension.to_uppercase(), &[extension.as_str()])
    .blocking_save_file();
  let Some(file) = picked else {
    return Ok(None);
  };
  let bytes = if base64 {
    base64::engine::general_purpose::STANDARD
      .decode(data)
      .map_err(|error| error.to_string())?
  } else {
    data.into_bytes()
  };
  write_bytes(into_path(file)?, &bytes).map(Some)
}

/// Вопрос «Да / Нет». window.confirm во встроенном WebView не годится: он отвечает «да», не показав окна.
#[tauri::command]
async fn ask(window: WebviewWindow, message: String) -> bool {
  window
    .dialog()
    .message(message)
    .title("Редактор DBML")
    .kind(MessageDialogKind::Warning)
    .buttons(MessageDialogButtons::OkCancelCustom("Да".into(), "Нет".into()))
    .parent(&window)
    .blocking_show()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![launch_file, open_file, save_file, save_file_as, ask])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
