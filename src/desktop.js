import { invoke } from "@tauri-apps/api/core";

// Файлы читает и пишет Rust-часть (src-tauri/src/lib.rs): у браузерного
// <input type="file"> нет пути, а без пути нечего перезаписать кнопкой «Сохранить».

/** Файл из аргумента запуска («Открыть с помощью»), иначе null. */
export function launchFile() {
  return invoke("launch_file");
}

/** Диалог открытия: { path, name, text, modified } или null, если отменили. */
export function openFile() {
  return invoke("open_file");
}

/**
 * Перезаписывает файл. `modified` — время изменения, которое видели при открытии:
 * если файл с тех пор поменяли на диске, Rust вернёт ошибку FILE_CHANGED, пока не передан force.
 * Возвращает { path, name, modified }.
 */
export function saveFile(path, text, modified, force = false) {
  return invoke("save_file", { path, text, modified: modified ?? null, force });
}

export const FILE_CHANGED = "FILE_CHANGED";

/** Нативный вопрос «Да / Нет» → true или false. window.confirm в WebView отвечает «да» без окна. */
export function ask(message) {
  return invoke("ask", { message });
}

/** Диалог «Сохранить как»: { path, name, modified } или null. content — строка или Blob. */
export async function saveFileAs(name, extension, content) {
  const binary = content instanceof Blob;
  const data = binary ? await blobToBase64(content) : content;
  return invoke("save_file_as", { name, extension, data, base64: binary });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
