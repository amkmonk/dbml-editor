#!/usr/bin/env node
// Сборка исполняемых файлов в release/.
//
//   node scripts/build.mjs                  пакеты для текущей ОС
//   node scripts/build.mjs windows          установщик и portable .exe
//   node scripts/build.mjs linux            .deb и AppImage
//   node scripts/build.mjs docker [windows|linux|all]   то же в Docker, без Rust на машине
//   ... --out <папка>                       куда сложить файлы (по умолчанию release/)
//
// Чужую ОС скрипт сам отправляет в Docker: Linux на Windows собирается только так,
// Windows на Linux — через cargo-xwin, если он стоит, иначе тоже в Docker.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const conf = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const version = pkg.version;
const product = conf.productName;
const binary = conf.mainBinaryName;
const WINDOWS_TRIPLE = "x86_64-pc-windows-msvc";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = path.resolve(root, outIndex >= 0 ? args.splice(outIndex, 2)[1] : "release");
const [command, dockerTarget = "all"] = args;

const host = { win32: "windows", linux: "linux" }[process.platform];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(cmd, cmdArgs, options = {}) {
  console.log(`> ${cmd} ${cmdArgs.join(" ")}`);
  const result = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", ...options });
  if (result.error) fail(`Не удалось запустить ${cmd}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function works(cmd, cmdArgs) {
  return spawnSync(cmd, cmdArgs, { stdio: "ignore" }).status === 0;
}

function docker(target) {
  if (!["windows", "linux", "all"].includes(target)) fail(`Docker умеет windows, linux или all, а не «${target}».`);
  if (!works("docker", ["version"])) fail("Docker не запущен или не установлен.");
  run("docker", [
    "build",
    "--file", path.join("scripts", "build.Dockerfile"),
    "--target", target,
    "--output", `type=local,dest=${outDir}`,
    ".",
  ]);
  report();
}

function tauriBuild(bundles, extra = []) {
  run(process.execPath, [path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"), "build", "--bundles", bundles, ...extra]);
}

/** Копирует файлы из папки бандла, меняя «DBML Editor» в имени на имя бинарника: без пробелов удобнее. */
function collect(dir, extension) {
  if (!fs.existsSync(dir)) fail(`Нет папки ${dir}: сборка не положила ${extension}.`);
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(extension));
  if (!files.length) fail(`В ${dir} нет ${extension}.`);
  for (const name of files) {
    copy(path.join(dir, name), name.replace(product, binary));
  }
}

function copy(from, name) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(from, path.join(outDir, name));
  if (!name.endsWith(".exe")) fs.chmodSync(path.join(outDir, name), 0o755);
}

function releaseDir(triple) {
  return path.join(root, "src-tauri", "target", ...(triple ? [triple] : []), "release");
}

function buildWindows() {
  const cross = host !== "windows";
  if (cross && !works("cargo", ["xwin", "--version"])) {
    console.log("cargo-xwin не найден: Windows собирается в Docker.");
    return docker("windows");
  }
  const triple = cross ? WINDOWS_TRIPLE : null;
  const dir = releaseDir(triple);
  fs.rmSync(path.join(dir, "bundle", "nsis"), { recursive: true, force: true });
  tauriBuild("nsis", cross ? ["--runner", "cargo-xwin", "--target", WINDOWS_TRIPLE] : []);
  collect(path.join(dir, "bundle", "nsis"), "-setup.exe");
  // Тот же exe без установки. Нужен WebView2 — в Windows 10 и 11 он обычно уже есть.
  copy(path.join(dir, `${binary}.exe`), `${binary}_${version}_x64-portable.exe`);
  report();
}

function buildLinux() {
  if (host !== "linux") {
    console.log("Linux-пакеты собираются только на Linux: запускаю Docker.");
    return docker("linux");
  }
  const dir = releaseDir(null);
  fs.rmSync(path.join(dir, "bundle", "deb"), { recursive: true, force: true });
  fs.rmSync(path.join(dir, "bundle", "appimage"), { recursive: true, force: true });
  tauriBuild("deb,appimage");
  collect(path.join(dir, "bundle", "deb"), ".deb");
  collect(path.join(dir, "bundle", "appimage"), ".AppImage");
  report();
}

function report() {
  if (!fs.existsSync(outDir)) return;
  const shown = path.relative(root, outDir);
  console.log(`\nГотово, ${shown && !shown.startsWith("..") ? shown : outDir}:`);
  for (const name of fs.readdirSync(outDir).sort()) {
    const size = fs.statSync(path.join(outDir, name)).size;
    console.log(`  ${name}  ${(size / 1024 / 1024).toFixed(1)} МБ`);
  }
}

const target = command || host;
if (target === "docker") docker(dockerTarget);
else if (target === "windows") buildWindows();
else if (target === "linux") buildLinux();
else if (!host) fail("Собирать умеем на Windows и Linux. На другой ОС: node scripts/build.mjs docker");
else fail(`Неизвестная цель «${target}». Есть: windows, linux, docker.`);
