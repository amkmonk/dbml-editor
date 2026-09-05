import interact from "./vendor/interact.js";
import { copySelection, moveColumn, moveColumnTo, moveSelection, nudgeStep, relatedTableIds } from "./actions.js";
import { centerOn, clampZoom, contentCenter, zoomAround } from "./camera.js";
import { emptyState, parseDbml, toDbml } from "./dbml.js";
import { fileStem, resolveSide, toPngBlob, toSql } from "./export.js";
import { createSession } from "./history.js";
import { fieldIcon, iconSvg } from "./icons.js";
import { fitZone } from "./layout.js";
import { DEFAULT_COLOR, nextZoneColor, normalizeHex, zonePaint } from "./colors.js";

const viewport = document.getElementById("viewport");
const world = document.getElementById("world");
const board = document.getElementById("board");
const svg = document.getElementById("wires");
const hint = document.getElementById("hint");
const fileNameEl = document.getElementById("fileName");
const panelEmpty = document.getElementById("panelEmpty");
const panelBody = document.getElementById("panelBody");
const catalogTree = document.getElementById("catalogTree");
const catalogSearch = document.getElementById("catalogSearch");
const btnDownload = document.getElementById("btnDownload");
const downloadList = document.getElementById("downloadList");
const btnLink = document.getElementById("btnLink");
const btnCopy = document.getElementById("btnCopy");
const btnDelete = document.getElementById("btnDelete");
const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnView = document.getElementById("btnView");
const btnEdit = document.getElementById("btnEdit");
const noteTip = document.getElementById("noteTip");
const showAll = document.getElementById("showAll");
const showCross = document.getElementById("showCross");
const showWires = document.getElementById("showWires");
const zoomReset = document.getElementById("zoomReset");

let state = emptyState();
let filename = "новый.dbml";
let dirty = false;
let selected = null;
let linkMode = false;
let linkFrom = null;
let zoom = 1;
let panX = 40;
let panY = 40;
let lastPointer = { x: 0, y: 0 };
let noteTimer = 0;
let panning = null;
let panMoved = 0;
let clickTarget = null;
let mode = "view";
let hoverTable = null;
let catalogToggle = {};
let savedJson = JSON.stringify(state);
const session = createSession(window.localStorage);

function setHint(text) {
  hint.innerHTML = text;
}

function persistSession() {
  session.persist({
    filename,
    mode,
    selected,
    catalogToggle,
    savedJson,
    zoom,
    panX,
    panY,
    state,
  });
}

function refreshDirty() {
  dirty = JSON.stringify(state) !== savedJson;
  fileNameEl.textContent = filename + (dirty ? " •" : "");
}

function updateUndoButtons() {
  btnUndo.disabled = !session.canUndo();
  btnRedo.disabled = !session.canRedo();
}

function commitChange() {
  session.commit(state);
  refreshDirty();
  persistSession();
  updateUndoButtons();
}

function markDirty() {
  commitChange();
}

function pruneSelection() {
  if (!selected) return;
  if (selected.type === "zone" && !zoneById(selected.id)) selected = null;
  else if (selected.type === "table" && !tableById(selected.id)) selected = null;
  else if (selected.type === "field") {
    const table = tableById(selected.table);
    if (!table?.columns.some((column) => column.name === selected.column)) selected = null;
  } else if (selected.type === "ref" && !state.refs[selected.index]) selected = null;
}

function confirmDiscard() {
  const hasWork = dirty || session.canUndo() || state.zones.length > 0 || state.tables.length > 0;
  return !hasWork || window.confirm("Текущий файл и история правок будут стёрты. Продолжить?");
}

function isEdit() {
  return mode === "edit";
}

function scale() {
  const box = board.getBoundingClientRect();
  return box.width / board.offsetWidth || 1;
}

function tableById(id) {
  return state.tables.find((table) => table.id === id);
}

function zoneById(id) {
  return state.zones.find((zone) => zone.id === id);
}

function isFk(tableId, column) {
  return state.refs.some((ref) => ref.from === tableId && ref.fromCol === column);
}

function visibleColumns(table) {
  if (isEdit() || showAll.checked) return table.columns;
  return table.columns.filter((column) => {
    if (!column.hidden) return true;
    return selected?.type === "field" && selected.table === table.id && selected.column === column.name;
  });
}

function showCrossWires() {
  return isEdit() || showCross.checked;
}

function showFkWires() {
  return isEdit() || showWires.checked;
}

function tableBoardPos(table) {
  const zone = zoneById(table.zone);
  return {
    x: (zone?.x || 0) + table.x,
    y: (zone?.y || 0) + table.y,
  };
}

function placeTableCard(table, card = board.querySelector(`.table[data-id="${cssEscape(table.id)}"]`)) {
  if (!card) return;
  const pos = tableBoardPos(table);
  card.style.left = `${pos.x}px`;
  card.style.top = `${pos.y}px`;
}

function placeZoneBox(zone) {
  const box = board.querySelector(`.zone[data-id="${cssEscape(zone.id)}"]`);
  if (!box) return;
  box.style.left = `${zone.x}px`;
  box.style.top = `${zone.y}px`;
  for (const table of state.tables.filter((item) => item.zone === zone.id)) {
    placeTableCard(table);
  }
}

function viewSize() {
  return { w: viewport.clientWidth, h: viewport.clientHeight };
}

function applyCamera() {
  world.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomReset.textContent = `${Math.round(zoom * 100)}%`;
}

function setCamera(next, persist = false) {
  zoom = next.zoom ?? zoom;
  panX = next.panX ?? panX;
  panY = next.panY ?? panY;
  applyCamera();
  if (persist) persistSession();
}

function zoomAtCenter(nextZoom) {
  const view = viewSize();
  setCamera(zoomAround(panX, panY, zoom, nextZoom, view.w / 2, view.h / 2), true);
}

function centerOnBoard(boardX, boardY, persist = true) {
  const view = viewSize();
  setCamera({ ...centerOn(view.w, view.h, zoom, boardX, boardY), zoom }, persist);
}

function centerOnContent() {
  const mid = contentCenter(state.zones);
  if (!mid) {
    setCamera({ zoom, panX: 40, panY: 40 }, true);
    return;
  }
  centerOnBoard(mid.x, mid.y);
}

function setMode(next) {
  mode = next;
  document.body.classList.toggle("mode-view", mode === "view");
  document.body.classList.toggle("mode-edit", mode === "edit");
  btnView.classList.toggle("active", mode === "view");
  btnEdit.classList.toggle("active", mode === "edit");
  setLinkMode(false);
  if (mode === "view") {
    setHint("Режим просмотра: колесо масштабирует от центра, перетаскивание двигает полотно. Наведите таблицу на секунду, чтобы увидеть заметку.");
  } else {
    setHover(null);
    hideNoteTip();
    setHint("Режим редактора: без Shift двигается полотно. Зоны, таблицы и поля тащите с зажатым Shift. Стрелки сдвигают выбранный объект, у поля вверх и вниз меняют порядок.");
  }
  persistSession();
  render();
}

function hideNoteTip() {
  window.clearTimeout(noteTimer);
  noteTimer = 0;
  noteTip.hidden = true;
}

function placeNoteTip(table) {
  const card = board.querySelector(`.table[data-id="${cssEscape(table.id)}"]`);
  if (!card) return;
  noteTip.hidden = false;
  noteTip.textContent = String(table.note).trim();
  const rect = card.getBoundingClientRect();
  const tip = noteTip.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top - tip.height - 8;
  if (top < 8) top = rect.bottom + 8;
  if (left + tip.width > window.innerWidth - 8) left = window.innerWidth - tip.width - 8;
  if (left < 8) left = 8;
  noteTip.style.left = `${left}px`;
  noteTip.style.top = `${top}px`;
}

function scheduleNoteTip(tableId) {
  hideNoteTip();
  const table = tableId ? tableById(tableId) : null;
  if (mode !== "view" || !table || !String(table.note || "").trim()) return;
  noteTimer = window.setTimeout(() => placeNoteTip(table), 1000);
}

function setHover(tableId) {
  hoverTable = tableId;
  document.body.classList.toggle("hovering", mode === "view" && Boolean(tableId));
  applyHoverPaint();
  scheduleNoteTip(tableId);
}

function applyHoverPaint() {
  const related = hoverTable ? relatedTableIds(state, hoverTable) : new Set();
  board.querySelectorAll(".table").forEach((card) => {
    card.classList.toggle("hot", hoverTable === card.dataset.id);
    card.classList.toggle("related", Boolean(hoverTable && related.has(card.dataset.id) && card.dataset.id !== hoverTable));
  });
  svg.querySelectorAll("path[data-index]").forEach((path) => {
    const ref = state.refs[Number(path.dataset.index)];
    path.classList.toggle(
      "hot",
      Boolean(hoverTable && ref && (ref.from === hoverTable || ref.to === hoverTable)),
    );
  });
}

function render() {
  hideNoteTip();
  board.querySelectorAll(".zone, .table").forEach((node) => node.remove());
  for (const zone of state.zones) {
    const paint = zonePaint(zone.color);
    const el = document.createElement("section");
    el.className = "zone";
    el.dataset.id = zone.id;
    el.style.left = `${zone.x}px`;
    el.style.top = `${zone.y}px`;
    el.style.width = `${zone.w}px`;
    el.style.height = `${zone.h}px`;
    el.style.background = paint.bg;
    el.style.borderColor = paint.border;
    el.style.color = paint.title;
    if (selected && selected.type === "zone" && selected.id === zone.id) {
      el.classList.add("selected");
    }
    el.innerHTML = `<h2>${escapeHtml(zone.title)}</h2><div class="resize"></div>`;
    el.addEventListener("mousedown", (event) => {
      if (event.target.closest(".table")) return;
      select({ type: "zone", id: zone.id });
    });
    board.appendChild(el);
  }

  for (const table of state.tables) {
    if (!zoneById(table.zone)) continue;
    const paint = zonePaint(zoneById(table.zone)?.color);
    const card = document.createElement("article");
    card.className = "table";
    card.dataset.id = table.id;
    if (selected && selected.type === "table" && selected.id === table.id) {
      card.classList.add("selected");
    }
    const cols = visibleColumns(table)
      .map((column) => {
        const mark = column.pk
          ? "<span class='mark pk'>PK</span>"
          : column.uk
            ? "<span class='mark uk'>UK</span>"
            : isFk(table.id, column.name)
              ? "<span class='mark fk'>FK</span>"
              : "";
        const active =
          selected &&
          selected.type === "field" &&
          selected.table === table.id &&
          selected.column === column.name
            ? " selected"
            : "";
        const fromHere =
          linkFrom && linkFrom.tableId === table.id && linkFrom.column === column.name ? " linking" : "";
        return `<li class="${active}${fromHere}" data-col="${escapeAttr(column.name)}">
          <button type="button" class="port left${linkFrom && linkFrom.tableId === table.id && linkFrom.column === column.name && linkFrom.side === "left" ? " active" : ""}" data-side="left" aria-label="Связь слева"></button>
          <span class="n">${mark}${escapeHtml(column.name)}</span>
          <span class="t">${escapeHtml(column.type)}</span>
          <button type="button" class="port right${linkFrom && linkFrom.tableId === table.id && linkFrom.column === column.name && linkFrom.side === "right" ? " active" : ""}" data-side="right" aria-label="Связь справа"></button>
        </li>`;
      })
      .join("");
    card.innerHTML = `<header class="th" style="color:${paint.header}">${escapeHtml(table.id)}</header><ul class="cols">${cols}</ul>`;
    placeTableCard(table, card);
    card.querySelector(".th").addEventListener("mousedown", () => select({ type: "table", id: table.id }));
    card.addEventListener("pointerenter", () => {
      if (mode === "view") setHover(table.id);
    });
    card.addEventListener("pointerleave", (event) => {
      if (mode !== "view") return;
      if (event.relatedTarget?.closest?.(".table")) return;
      setHover(null);
    });
    card.querySelectorAll("li").forEach((row) => {
      const column = row.dataset.col;
      row.addEventListener("click", (event) => {
        if (event.target.closest(".port") || !isEdit()) return;
        event.stopPropagation();
        if (linkMode) {
          pickLink(table.id, column, event.offsetX > row.clientWidth / 2 ? "right" : "left");
          return;
        }
        select({ type: "field", table: table.id, column });
      });
      if (isEdit()) {
        row.addEventListener("pointerdown", (event) => {
          row.draggable = Boolean(event.shiftKey) && !event.target.closest(".port");
        });
        row.addEventListener("dragstart", (event) => {
          if (!event.shiftKey || event.target.closest(".port")) {
            event.preventDefault();
            row.draggable = false;
            return;
          }
          event.dataTransfer.setData("text/plain", column);
          event.dataTransfer.effectAllowed = "move";
          row.classList.add("dragging-col");
          select({ type: "field", table: table.id, column });
        });
        row.addEventListener("dragend", () => {
          row.classList.remove("dragging-col");
          row.draggable = false;
        });
        row.addEventListener("dragover", (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          row.classList.add("drag-over");
        });
        row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
        row.addEventListener("drop", (event) => {
          event.preventDefault();
          row.classList.remove("drag-over");
          const fromName = event.dataTransfer.getData("text/plain");
          const target = table.columns.findIndex((item) => item.name === column);
          if (!moveColumnTo(table, fromName, target)) return;
          selected = { type: "field", table: table.id, column: fromName };
          markDirty();
          render();
        });
      }
      row.querySelectorAll(".port").forEach((port) => {
        port.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!isEdit()) return;
          if (!linkMode) setLinkMode(true);
          pickLink(table.id, column, port.dataset.side);
        });
      });
    });
    board.appendChild(card);
  }

  board.appendChild(svg);
  bindInteract();
  applyCamera();
  drawWires();
  renderPanel();
  renderCatalog();
  refreshDirty();
  updateUndoButtons();
  if (mode === "view" && hoverTable) scheduleNoteTip(hoverTable);
}

function bindInteract() {
  interact(".zone").unset();
  interact(".table .th").unset();
  if (!isEdit()) return;

  interact(".zone").draggable({
    ignoreFrom: ".resize",
    styleCursor: false,
    listeners: {
      start(event) {
        if (!event.shiftKey) {
          event.interaction.stop();
          return;
        }
        document.body.classList.add("dragging");
      },
      move(event) {
        const zone = zoneById(event.target.dataset.id);
        const k = scale();
        zone.x += event.dx / k;
        zone.y += event.dy / k;
        placeZoneBox(zone);
        drawWires();
      },
      end() {
        document.body.classList.remove("dragging");
        markDirty();
      },
    },
  });

  interact(".table .th").draggable({
    styleCursor: false,
    listeners: {
      start(event) {
        if (!event.shiftKey) {
          event.interaction.stop();
          return;
        }
        document.body.classList.add("dragging");
      },
      move(event) {
        const table = tableById(event.target.closest(".table").dataset.id);
        const k = scale();
        table.x += event.dx / k;
        table.y += event.dy / k;
        placeTableCard(table, event.target.closest(".table"));
        drawWires();
      },
      end(event) {
        document.body.classList.remove("dragging");
        const table = tableById(event.target.closest(".table").dataset.id);
        const under = document
          .elementsFromPoint(event.client.x, event.client.y)
          .find((node) => node.classList?.contains("zone"));
        if (under && under.dataset.id !== table.zone) {
          const pos = tableBoardPos(table);
          table.zone = under.dataset.id;
          table.x = pos.x - Number.parseFloat(under.style.left);
          table.y = pos.y - Number.parseFloat(under.style.top);
          render();
        }
        markDirty();
        drawWires();
      },
    },
  });

  interact(".zone").resizable({
    edges: { right: ".resize", bottom: ".resize", left: false, top: false },
    listeners: {
      move(event) {
        const zone = zoneById(event.target.dataset.id);
        const k = scale();
        zone.w = Math.max(220, zone.w + event.deltaRect.width / k);
        zone.h = Math.max(140, zone.h + event.deltaRect.height / k);
        event.target.style.width = `${zone.w}px`;
        event.target.style.height = `${zone.h}px`;
        drawWires();
      },
      end() {
        markDirty();
      },
    },
  });
}

function boxInBoard(el) {
  let x = 0;
  let y = 0;
  let node = el;
  while (node && node !== board) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function point(el, side) {
  const box = boxInBoard(el);
  if (side === "left") return { x: box.x, y: box.y + box.h / 2 };
  if (side === "right") return { x: box.x + box.w, y: box.y + box.h / 2 };
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function fieldNode(tableId, column) {
  return board.querySelector(`.table[data-id="${cssEscape(tableId)}"] li[data-col="${cssEscape(column)}"]`);
}

function portPoint(tableId, column, side) {
  const row = fieldNode(tableId, column);
  const card = board.querySelector(`.table[data-id="${cssEscape(tableId)}"]`);
  return point(row || card, side);
}

function clientToBoard(event) {
  const rect = board.getBoundingClientRect();
  const k = scale();
  return {
    x: (event.clientX - rect.left) / k,
    y: (event.clientY - rect.top) / k,
  };
}

function wirePath(p1, fromSide, p2, toSide) {
  const dx = Math.max(36, Math.abs(p2.x - p1.x) * 0.4);
  const sx = fromSide === "right" ? 1 : -1;
  const tx = toSide === "right" ? 1 : -1;
  return `M ${p1.x} ${p1.y} C ${p1.x + sx * dx} ${p1.y}, ${p2.x + tx * dx} ${p2.y}, ${p2.x} ${p2.y}`;
}

function drawWires() {
  svg.innerHTML = "";
  const width = Math.max(board.scrollWidth, board.offsetWidth);
  const height = Math.max(board.scrollHeight, board.offsetHeight);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (showFkWires()) {
    state.refs.forEach((ref, index) => {
      const fromTable = tableById(ref.from);
      const toTable = tableById(ref.to);
      if (fromTable && toTable && fromTable.zone !== toTable.zone && !showCrossWires()) return;
      const a = board.querySelector(`.table[data-id="${cssEscape(ref.from)}"]`);
      const b = board.querySelector(`.table[data-id="${cssEscape(ref.to)}"]`);
      if (!a || !b) return;
      const fromBox = boxInBoard(a);
      const toBox = boxInBoard(b);
      const fromSide = resolveSide(ref.fromSide, fromBox, toBox, "from");
      const toSide = resolveSide(ref.toSide, fromBox, toBox, "to");
      const p1 = portPoint(ref.from, ref.fromCol, fromSide);
      const p2 = portPoint(ref.to, ref.toCol, toSide);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", wirePath(p1, fromSide, p2, toSide));
      path.setAttribute("stroke", zonePaint(zoneById(fromTable?.zone)?.color).header);
      if (String(ref.onDelete).toUpperCase() === "SET NULL") path.classList.add("set-null");
      if (selected && selected.type === "ref" && selected.index === index) path.classList.add("hot");
      path.dataset.index = String(index);
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        if (isEdit()) select({ type: "ref", index });
      });
      svg.appendChild(path);
    });
  }
  if (isEdit() && linkMode && linkFrom) {
    const origin = portPoint(linkFrom.tableId, linkFrom.column, linkFrom.side);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", wirePath(origin, linkFrom.side, lastPointer, linkFrom.side === "left" ? "right" : "left"));
    path.classList.add("preview");
    svg.appendChild(path);
  }
  applyHoverPaint();
}

function selectionKey(item) {
  if (!item) return "";
  if (item.type === "zone") return `zone:${item.id}`;
  if (item.type === "table") return `table:${item.id}`;
  if (item.type === "field") return `field:${item.table}.${item.column}`;
  if (item.type === "ref") return `ref:${item.index}`;
  return "";
}

function select(next, fromCatalog = false) {
  selected = next;
  if (next?.type === "field") {
    const table = tableById(next.table);
    catalogToggle[`table:${next.table}`] = true;
    if (table) catalogToggle[`zone:${table.zone}`] = true;
    catalogToggle["sec:zones"] = true;
  }
  persistSession();
  renderPanel();
  renderCatalog();
  board.querySelectorAll(".selected").forEach((node) => node.classList.remove("selected"));
  if (next?.type === "zone") {
    board.querySelector(`.zone[data-id="${cssEscape(next.id)}"]`)?.classList.add("selected");
  }
  if (next?.type === "table") {
    board.querySelector(`.table[data-id="${cssEscape(next.id)}"]`)?.classList.add("selected");
  }
  if (next?.type === "field") {
    const card = board.querySelector(`.table[data-id="${cssEscape(next.table)}"]`);
    card?.classList.add("selected");
    card?.querySelector(`li[data-col="${cssEscape(next.column)}"]`)?.classList.add("selected");
  }
  if (mode === "view") {
    if (next?.type === "table") setHover(next.id);
    else if (next?.type === "field") setHover(next.table);
    else setHover(null);
  }
  drawWires();
  if (fromCatalog) revealSelected();
}

function revealSelected() {
  if (selected?.type === "ref") {
    const ref = state.refs[selected.index];
    const fromEl = board.querySelector(`.table[data-id="${cssEscape(ref?.from || "")}"]`);
    const toEl = board.querySelector(`.table[data-id="${cssEscape(ref?.to || "")}"]`);
    if (fromEl && toEl) {
      const a = boxInBoard(fromEl);
      const b = boxInBoard(toEl);
      centerOnBoard((a.x + a.w / 2 + b.x + b.w / 2) / 2, (a.y + a.h / 2 + b.y + b.h / 2) / 2);
      return;
    }
  }
  let node = null;
  if (selected?.type === "zone") node = board.querySelector(`.zone[data-id="${cssEscape(selected.id)}"]`);
  if (selected?.type === "table") node = board.querySelector(`.table[data-id="${cssEscape(selected.id)}"]`);
  if (selected?.type === "field") node = board.querySelector(`.table[data-id="${cssEscape(selected.table)}"]`);
  if (!node) return;
  const box = boxInBoard(node);
  centerOnBoard(box.x + box.w / 2, box.y + box.h / 2);
}

function isNodeOpen(key) {
  if (catalogSearch.value.trim()) return true;
  if (Object.hasOwn(catalogToggle, key)) return catalogToggle[key];
  return !key.startsWith("table:");
}

function catalogRow(item, label, icon, toggleKey, hasKids) {
  const active = selectionKey(item) === selectionKey(selected) ? " active" : "";
  const open = toggleKey ? isNodeOpen(toggleKey) : false;
  const chevron = hasKids
    ? `<button type="button" class="tree-chevron${open ? " open" : ""}" data-toggle="${escapeAttr(toggleKey)}" aria-expanded="${open}">${iconSvg("chevron")}</button>`
    : `<span class="tree-chevron spacer"></span>`;
  return `<div class="tree-row">
    ${chevron}
    <button type="button" class="tree-item${active}" data-key="${escapeAttr(JSON.stringify(item))}">
      ${iconSvg(icon)}<span>${escapeHtml(label)}</span>
    </button>
  </div>`;
}

function renderCatalog() {
  const query = catalogSearch.value.trim().toLowerCase();
  const match = (text) => !query || String(text).toLowerCase().includes(query);
  const parts = [];
  const zonesOpen = isNodeOpen("sec:zones");
  parts.push(`<div class="tree-group"><div class="tree-row">
    <button type="button" class="tree-chevron${zonesOpen ? " open" : ""}" data-toggle="sec:zones" aria-expanded="${zonesOpen}">${iconSvg("chevron")}</button>
    <span class="tree-section">Зоны</span>
  </div>`);
  if (zonesOpen) {
    parts.push('<div class="tree-kids">');
    let zoneCount = 0;
    for (const zone of state.zones) {
      const tables = state.tables.filter((table) => table.zone === zone.id);
      const zoneHit = match(zone.title) || match(zone.id);
      const visibleTables = tables.filter(
        (table) => zoneHit || match(table.id) || table.columns.some((column) => match(column.name)),
      );
      if (query && !zoneHit && !visibleTables.length) continue;
      zoneCount += 1;
      const zoneKey = `zone:${zone.id}`;
      const zoneOpen = isNodeOpen(zoneKey);
      parts.push(catalogRow({ type: "zone", id: zone.id }, zone.title, "zone", zoneKey, true));
      if (!zoneOpen) continue;
      parts.push('<div class="tree-kids">');
      for (const table of visibleTables) {
        const tableKey = `table:${table.id}`;
        const tableOpen = isNodeOpen(tableKey);
        const visibleCols = table.columns.filter(
          (column) => !query || match(column.name) || match(table.id) || zoneHit,
        );
        parts.push(catalogRow({ type: "table", id: table.id }, table.id, "table", tableKey, true));
        if (!tableOpen) continue;
        parts.push('<div class="tree-kids">');
        for (const column of visibleCols) {
          parts.push(catalogRow({ type: "field", table: table.id, column: column.name }, column.name, fieldIcon(column), "", false));
        }
        if (!visibleCols.length) parts.push('<div class="tree-empty">Нет полей</div>');
        parts.push("</div>");
      }
      if (!visibleTables.length) parts.push('<div class="tree-empty">Нет таблиц</div>');
      parts.push("</div>");
    }
    if (!zoneCount) parts.push('<div class="tree-empty">Нет зон</div>');
    parts.push("</div>");
  }
  const refsOpen = isNodeOpen("sec:refs");
  parts.push(`</div><div class="tree-group"><div class="tree-row">
    <button type="button" class="tree-chevron${refsOpen ? " open" : ""}" data-toggle="sec:refs" aria-expanded="${refsOpen}">${iconSvg("chevron")}</button>
    <span class="tree-section">Связи</span>
  </div>`);
  if (refsOpen) {
    parts.push('<div class="tree-kids">');
    let refCount = 0;
    state.refs.forEach((ref, index) => {
      const label = `${ref.from}.${ref.fromCol} → ${ref.to}.${ref.toCol}`;
      if (!match(label)) return;
      refCount += 1;
      parts.push(catalogRow({ type: "ref", index }, label, "ref", "", false));
    });
    if (!refCount) parts.push('<div class="tree-empty">Нет связей</div>');
    parts.push("</div>");
  }
  parts.push("</div>");
  catalogTree.innerHTML = parts.join("");
  catalogTree.querySelectorAll("button[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      select(JSON.parse(button.dataset.key), true);
    });
  });
  catalogTree.querySelectorAll("button[data-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const key = button.dataset.toggle;
      const current = Object.hasOwn(catalogToggle, key) ? catalogToggle[key] : !key.startsWith("table:");
      catalogToggle[key] = !current;
      persistSession();
      renderCatalog();
    });
  });
}

function lockPanelIfView() {
  if (isEdit()) return;
  panelBody.querySelectorAll("input, select, textarea, button").forEach((node) => {
    node.disabled = true;
  });
}

function renderPanel() {
  btnCopy.disabled = !selected;
  btnDelete.disabled = !selected;
  if (!isEdit()) return;
  if (!selected) {
    panelEmpty.hidden = false;
    panelBody.hidden = true;
    return;
  }
  panelEmpty.hidden = true;
  panelBody.hidden = false;
  if (selected.type === "zone") {
    const zone = zoneById(selected.id);
    const color = normalizeHex(zone.color);
    panelBody.innerHTML = `
      <label>Название зоны<input id="pTitle" value="${escapeAttr(zone.title)}"></label>
      <label>Цвет
        <span class="color-row">
          <input type="color" id="pColor" value="${color}">
          <input id="pHex" value="${color}">
        </span>
      </label>`;
    panelBody.querySelector("#pTitle").addEventListener("change", (event) => {
      zone.title = event.target.value;
      markDirty();
      render();
    });
    const paintZone = (value, commit) => {
      zone.color = normalizeHex(value, zone.color || DEFAULT_COLOR);
      const paint = zonePaint(zone.color);
      const box = board.querySelector(`.zone[data-id="${cssEscape(zone.id)}"]`);
      if (box) {
        box.style.background = paint.bg;
        box.style.borderColor = paint.border;
        box.style.color = paint.title;
      }
      board.querySelectorAll(".table").forEach((card) => {
        const table = tableById(card.dataset.id);
        if (table?.zone !== zone.id) return;
        card.querySelector(".th")?.style.setProperty("color", paint.header);
      });
      drawWires();
      panelBody.querySelector("#pColor").value = zone.color;
      panelBody.querySelector("#pHex").value = zone.color;
      refreshDirty();
      if (commit) commitChange();
    };
    panelBody.querySelector("#pColor").addEventListener("input", (event) => paintZone(event.target.value, false));
    panelBody.querySelector("#pColor").addEventListener("change", (event) => paintZone(event.target.value, true));
    panelBody.querySelector("#pHex").addEventListener("change", (event) => paintZone(event.target.value, true));
    lockPanelIfView();
    return;
  }
  if (selected.type === "table") {
    const table = tableById(selected.id);
    panelBody.innerHTML = `
      <label>Имя таблицы<input id="pName" value="${escapeAttr(table.id)}"></label>
      <label>Зона
        <select id="pZone">${state.zones.map((zone) => `<option value="${escapeAttr(zone.id)}">${escapeHtml(zone.title)}</option>`).join("")}</select>
      </label>
      <label>Заметка<textarea id="pNote">${escapeHtml(table.note || "")}</textarea></label>`;
    panelBody.querySelector("#pZone").value = table.zone;
    panelBody.querySelector("#pName").addEventListener("change", (event) => renameTable(table, event.target.value));
    panelBody.querySelector("#pZone").addEventListener("change", (event) => {
      const pos = tableBoardPos(table);
      table.zone = event.target.value;
      const zone = zoneById(table.zone);
      table.x = pos.x - (zone?.x || 0);
      table.y = pos.y - (zone?.y || 0);
      markDirty();
      render();
    });
    panelBody.querySelector("#pNote").addEventListener("change", (event) => {
      table.note = event.target.value;
      markDirty();
    });
    lockPanelIfView();
    return;
  }
  if (selected.type === "field") {
    const table = tableById(selected.table);
    const column = table.columns.find((item) => item.name === selected.column);
    panelBody.innerHTML = `
      <label>Поле<input id="pCol" value="${escapeAttr(column.name)}"></label>
      <label>Тип<input id="pType" value="${escapeAttr(column.type)}"></label>
      <div class="checks">
        <label><input type="checkbox" id="pPk"> PK</label>
        <label><input type="checkbox" id="pUk"> UK</label>
        <label><input type="checkbox" id="pHidden"> Скрывать в просмотре</label>
      </div>
      <div class="row">
        <button type="button" id="pUp">Выше</button>
        <button type="button" id="pDown">Ниже</button>
      </div>
      <p class="note">Поле можно перетащить в таблице или сдвинуть стрелками вверх и вниз.</p>`;
    panelBody.querySelector("#pPk").checked = column.pk;
    panelBody.querySelector("#pUk").checked = column.uk;
    panelBody.querySelector("#pHidden").checked = Boolean(column.hidden);
    panelBody.querySelector("#pCol").addEventListener("change", (event) => renameColumn(table, column, event.target.value));
    panelBody.querySelector("#pType").addEventListener("change", (event) => {
      column.type = event.target.value;
      markDirty();
      render();
    });
    panelBody.querySelector("#pPk").addEventListener("change", (event) => {
      column.pk = event.target.checked;
      markDirty();
      render();
    });
    panelBody.querySelector("#pUk").addEventListener("change", (event) => {
      column.uk = event.target.checked;
      markDirty();
      render();
    });
    panelBody.querySelector("#pHidden").addEventListener("change", (event) => {
      column.hidden = event.target.checked;
      markDirty();
    });
    const index = table.columns.findIndex((item) => item.name === column.name);
    panelBody.querySelector("#pUp").disabled = index <= 0;
    panelBody.querySelector("#pDown").disabled = index < 0 || index >= table.columns.length - 1;
    panelBody.querySelector("#pUp").addEventListener("click", () => shiftSelectedField(-1));
    panelBody.querySelector("#pDown").addEventListener("click", () => shiftSelectedField(1));
    lockPanelIfView();
    return;
  }
  if (selected.type === "ref") {
    const ref = state.refs[selected.index];
    panelBody.innerHTML = `
      <p><strong>${escapeHtml(ref.from)}.${escapeHtml(ref.fromCol)}</strong> → <strong>${escapeHtml(ref.to)}.${escapeHtml(ref.toCol)}</strong></p>
      <p class="note">Стороны линии в DBML нет — они пишутся в комментарии раскладки.</p>
      <div class="row">
        <label>Источник
          <select id="pFromSide">
            <option value="auto">Авто</option>
            <option value="left">Слева</option>
            <option value="right">Справа</option>
          </select>
        </label>
        <label>Назначение
          <select id="pToSide">
            <option value="auto">Авто</option>
            <option value="left">Слева</option>
            <option value="right">Справа</option>
          </select>
        </label>
      </div>
      <label>ON DELETE
        <select id="pDel">
          <option value="RESTRICT">RESTRICT</option>
          <option value="SET NULL">SET NULL</option>
          <option value="CASCADE">CASCADE</option>
          <option value="NO ACTION">NO ACTION</option>
        </select>
      </label>`;
    panelBody.querySelector("#pFromSide").value = sideToken(ref.fromSide);
    panelBody.querySelector("#pToSide").value = sideToken(ref.toSide);
    panelBody.querySelector("#pDel").value = ref.onDelete;
    panelBody.querySelector("#pFromSide").addEventListener("change", (event) => {
      ref.fromSide = event.target.value;
      markDirty();
      drawWires();
    });
    panelBody.querySelector("#pToSide").addEventListener("change", (event) => {
      ref.toSide = event.target.value;
      markDirty();
      drawWires();
    });
    panelBody.querySelector("#pDel").addEventListener("change", (event) => {
      ref.onDelete = event.target.value;
      markDirty();
      drawWires();
    });
    lockPanelIfView();
  }
}

function sideToken(value) {
  return value === "left" || value === "right" ? value : "auto";
}

function shiftSelectedField(delta) {
  if (!isEdit() || selected?.type !== "field") return false;
  const table = tableById(selected.table);
  if (!moveColumn(table, selected.column, delta)) return false;
  markDirty();
  render();
  return true;
}

function renameTable(table, next) {
  const name = slug(next);
  if (!name || state.tables.some((item) => item.id === name && item !== table)) {
    setHint("Имя таблицы пустое или уже занято.");
    return;
  }
  for (const ref of state.refs) {
    if (ref.from === table.id) ref.from = name;
    if (ref.to === table.id) ref.to = name;
  }
  table.id = name;
  selected = { type: "table", id: name };
  markDirty();
  render();
}

function renameColumn(table, column, next) {
  const name = slug(next);
  if (!name || table.columns.some((item) => item.name === name && item !== column)) {
    setHint("Имя поля пустое или уже занято.");
    return;
  }
  for (const ref of state.refs) {
    if (ref.from === table.id && ref.fromCol === column.name) ref.fromCol = name;
    if (ref.to === table.id && ref.toCol === column.name) ref.toCol = name;
  }
  column.name = name;
  selected = { type: "field", table: table.id, column: name };
  markDirty();
  render();
}

function pickLink(tableId, column, side) {
  const nextSide = side === "right" ? "right" : "left";
  if (!linkFrom) {
    linkFrom = { tableId, column, side: nextSide };
    render();
    setHint(`Связь от ${tableId}.${column} (${nextSide === "left" ? "слева" : "справа"}). Выберите поле и сторону назначения.`);
    return;
  }
  if (linkFrom.tableId === tableId && linkFrom.column === column) {
    linkFrom = { tableId, column, side: nextSide };
    render();
    setHint(`Сторона источника: ${nextSide === "left" ? "слева" : "справа"}. Выберите поле назначения.`);
    return;
  }
  state.refs.push({
    from: linkFrom.tableId,
    fromCol: linkFrom.column,
    to: tableId,
    toCol: column,
    fromSide: linkFrom.side,
    toSide: nextSide,
    onDelete: "RESTRICT",
  });
  linkFrom = null;
  setLinkMode(false);
  markDirty();
  selected = { type: "ref", index: state.refs.length - 1 };
  render();
  setHint("Связь добавлена от поля к полю. Стороны можно сменить в свойствах.");
}

function setLinkMode(on) {
  linkMode = on && isEdit();
  btnLink.classList.toggle("active", linkMode);
  document.body.classList.toggle("link-mode", linkMode);
  if (!linkMode) linkFrom = null;
  if (!linkMode) drawWires();
}

function addZone() {
  if (!isEdit()) return;
  const n = state.zones.length + 1;
  const zone = {
    id: `zone_${n}`,
    title: `Зона ${n}`,
    color: nextZoneColor(state.zones.length),
    x: 40 + n * 24,
    y: 40 + n * 24,
    w: 360,
    h: 260,
  };
  state.zones.push(zone);
  selected = { type: "zone", id: zone.id };
  markDirty();
  render();
}

function addTable() {
  if (!isEdit()) return;
  const zone = selected?.type === "zone" ? zoneById(selected.id) : state.zones[0];
  if (!zone) {
    setHint("Сначала создайте зону.");
    return;
  }
  let n = 1;
  while (state.tables.some((table) => table.id === `table_${n}`)) n += 1;
  const table = {
    id: `table_${n}`,
    zone: zone.id,
    note: "",
    x: 16 + (state.tables.filter((item) => item.zone === zone.id).length % 3) * 40,
    y: 16 + state.tables.filter((item) => item.zone === zone.id).length * 12,
    columns: [{ name: "id", type: "uuid", pk: true, uk: false, hidden: false }],
  };
  state.tables.push(table);
  fitZone(state, zone);
  selected = { type: "table", id: table.id };
  markDirty();
  render();
}

function addField() {
  if (!isEdit()) return;
  const table =
    selected?.type === "table"
      ? tableById(selected.id)
      : selected?.type === "field"
        ? tableById(selected.table)
        : null;
  if (!table) {
    setHint("Выберите таблицу, чтобы добавить поле.");
    return;
  }
  let n = 1;
  while (table.columns.some((column) => column.name === `field_${n}`)) n += 1;
  table.columns.push({ name: `field_${n}`, type: "text", pk: false, uk: false, hidden: false });
  catalogToggle[`table:${table.id}`] = true;
  selected = { type: "field", table: table.id, column: `field_${n}` };
  markDirty();
  render();
}

function duplicateSelected() {
  if (!isEdit() || !selected) {
    setHint("Выберите объект в режиме редактора, чтобы копировать.");
    return;
  }
  const next = copySelection(state, selected);
  if (!next) return;
  selected = next;
  markDirty();
  render();
  growBoard();
  setHint("Создана копия вместе с дочерними объектами.");
}

function removeSelected() {
  if (!isEdit() || !selected) return;
  if (selected.type === "ref") {
    state.refs.splice(selected.index, 1);
  } else if (selected.type === "field") {
    const table = tableById(selected.table);
    table.columns = table.columns.filter((column) => column.name !== selected.column);
    state.refs = state.refs.filter(
      (ref) =>
        !(ref.from === table.id && ref.fromCol === selected.column) &&
        !(ref.to === table.id && ref.toCol === selected.column),
    );
  } else if (selected.type === "table") {
    state.refs = state.refs.filter((ref) => ref.from !== selected.id && ref.to !== selected.id);
    state.tables = state.tables.filter((table) => table.id !== selected.id);
  } else if (selected.type === "zone") {
    if (state.tables.some((table) => table.zone === selected.id)) {
      if (!window.confirm("Удалить зону вместе с таблицами внутри?")) return;
      const ids = state.tables.filter((table) => table.zone === selected.id).map((table) => table.id);
      state.tables = state.tables.filter((table) => table.zone !== selected.id);
      state.refs = state.refs.filter((ref) => !ids.includes(ref.from) && !ids.includes(ref.to));
    }
    state.zones = state.zones.filter((zone) => zone.id !== selected.id);
  }
  selected = null;
  markDirty();
  render();
}

function loadState(next, name) {
  state = next;
  filename = name;
  savedJson = JSON.stringify(state);
  dirty = false;
  selected = null;
  catalogToggle = {};
  session.reset(state);
  persistSession();
  setLinkMode(false);
  setHover(null);
  render();
  growBoard();
  centerOnContent();
  updateUndoButtons();
}

function applyHistory(next) {
  if (!next) return;
  state = next;
  pruneSelection();
  persistSession();
  render();
  growBoard();
  updateUndoButtons();
}

function growBoard() {
  let maxX = 1600;
  let maxY = 1100;
  for (const zone of state.zones) {
    maxX = Math.max(maxX, zone.x + zone.w + 80);
    maxY = Math.max(maxY, zone.y + zone.h + 80);
  }
  board.style.minWidth = `${maxX}px`;
  board.style.minHeight = `${maxY}px`;
  applyCamera();
  drawWires();
}

function downloadBlob(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function closeDownloadMenu() {
  downloadList.hidden = true;
  btnDownload.setAttribute("aria-expanded", "false");
}

function toggleDownloadMenu() {
  const open = downloadList.hidden;
  downloadList.hidden = !open;
  btnDownload.setAttribute("aria-expanded", open ? "true" : "false");
}

function exportAs(kind) {
  closeDownloadMenu();
  const stem = fileStem(filename);
  if (kind === "dbml") {
    downloadBlob(toDbml(state), `${stem}.dbml`, "text/plain;charset=utf-8");
    savedJson = JSON.stringify(state);
    dirty = false;
    persistSession();
    fileNameEl.textContent = filename;
    setHint("Скачан файл DBML.");
    return;
  }
  if (kind === "sql") {
    downloadBlob(toSql(state), `${stem}.sql`, "text/plain;charset=utf-8");
    setHint("Скачан SQL: CREATE TABLE и внешние ключи.");
    return;
  }
  if (kind === "png") {
    toPngBlob(state)
      .then((blob) => {
        downloadBlob(blob, `${stem}.png`, "image/png");
        setHint("Скачано изображение схемы в PNG.");
      })
      .catch((error) => {
        setHint(`Не удалось собрать PNG: ${error.message || error}`);
      });
  }
}

function slug(value) {
  return String(value || "")
    .trim()
    .replaceAll(/\s+/g, "_")
    .replaceAll(/[^A-Za-z0-9_а-яА-ЯёЁ-]/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : String(value).replaceAll('"', '\\"');
}

function isChrome(event) {
  return Boolean(event.target.closest("aside, header, #hint"));
}

function setShiftHold(on) {
  document.body.classList.toggle("shift-hold", Boolean(on));
}

function isPanTarget(event) {
  if (isChrome(event)) return false;
  if (event.button === 1) return true;
  if (event.button !== 0) return false;
  if (mode === "view") return true;
  if (event.target.closest(".resize, .port, #wires path")) return false;
  if (event.shiftKey && event.target.closest(".table, .zone")) return false;
  return true;
}

function selectFromTarget(target) {
  const table = target.closest?.(".table");
  if (table) {
    const row = target.closest("li[data-col]");
    if (row && isEdit()) select({ type: "field", table: table.dataset.id, column: row.dataset.col });
    else select({ type: "table", id: table.dataset.id });
    return;
  }
  const zone = target.closest?.(".zone");
  if (zone) select({ type: "zone", id: zone.dataset.id });
}

document.getElementById("btnNew").addEventListener("click", () => {
  if (!confirmDiscard()) return;
  loadState(emptyState(), "новый.dbml");
  setHint("Пустая доска. Перейдите в редактор, чтобы создать зону.");
});

document.getElementById("fileOpen").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !confirmDiscard()) return;
  try {
    loadState(parseDbml(await file.text()), file.name);
    setHint(`Открыт файл ${file.name}.`);
  } catch (error) {
    setHint(`Не удалось разобрать DBML: ${error.message || error}`);
  }
});

btnDownload.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleDownloadMenu();
});
downloadList.querySelectorAll("[data-export]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    exportAs(button.dataset.export);
  });
});
document.addEventListener("click", () => closeDownloadMenu());
document.getElementById("btnUndo").addEventListener("click", () => applyHistory(session.undo()));
document.getElementById("btnRedo").addEventListener("click", () => applyHistory(session.redo()));
document.getElementById("btnZone").addEventListener("click", addZone);
document.getElementById("btnTable").addEventListener("click", addTable);
document.getElementById("btnField").addEventListener("click", addField);
document.getElementById("btnCopy").addEventListener("click", duplicateSelected);
document.getElementById("btnLink").addEventListener("click", () => {
  if (!isEdit()) return;
  setLinkMode(!linkMode);
  if (linkMode) {
    setHint("Связь: нажмите кружок слева или справа у поля-источника, затем у назначения.");
    render();
  } else {
    setHint("Режим связи выключен.");
    render();
  }
});
document.getElementById("btnDelete").addEventListener("click", removeSelected);
btnView.addEventListener("click", () => setMode("view"));
btnEdit.addEventListener("click", () => setMode("edit"));
showAll.addEventListener("change", render);
showCross.addEventListener("change", drawWires);
showWires.addEventListener("change", drawWires);
catalogSearch.addEventListener("input", renderCatalog);
zoomReset.addEventListener("click", () => {
  hideNoteTip();
  zoomAtCenter(1);
});
viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    hideNoteTip();
    const next = clampZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1));
    if (next === zoom) return;
    zoomAtCenter(next);
  },
  { passive: false },
);
viewport.addEventListener("pointerdown", (event) => {
  lastPointer = clientToBoard(event);
  clickTarget = event.target;
  panMoved = 0;
  if (!isPanTarget(event)) return;
  event.preventDefault();
  hideNoteTip();
  panning = {
    x: event.clientX,
    y: event.clientY,
    panX,
    panY,
  };
  viewport.setPointerCapture(event.pointerId);
  document.body.classList.add("panning");
});
viewport.addEventListener("pointermove", (event) => {
  lastPointer = clientToBoard(event);
  if (panning) {
    const dx = event.clientX - panning.x;
    const dy = event.clientY - panning.y;
    panMoved = Math.max(panMoved, Math.abs(dx) + Math.abs(dy));
    setCamera({ zoom, panX: panning.panX + dx, panY: panning.panY + dy });
    return;
  }
  if (isEdit() && linkMode && linkFrom) drawWires();
});
viewport.addEventListener("pointerup", (event) => {
  const wasPanning = Boolean(panning);
  panning = null;
  document.body.classList.remove("panning");
  if (wasPanning && panMoved >= 5) persistSession();
  if (wasPanning && panMoved < 5 && clickTarget && !isChrome(event)) {
    selectFromTarget(clickTarget);
  }
});
viewport.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Shift") setShiftHold(true);
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
  if ((event.ctrlKey || event.metaKey) && !typing && (event.key === "z" || event.key === "Z")) {
    if (!isEdit()) return;
    event.preventDefault();
    applyHistory(event.shiftKey ? session.redo() : session.undo());
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !typing && (event.key === "y" || event.key === "Y")) {
    if (!isEdit()) return;
    event.preventDefault();
    applyHistory(session.redo());
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "c" || event.key === "d") && !typing) {
    event.preventDefault();
    duplicateSelected();
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && !typing) {
    if (!isEdit()) return;
    event.preventDefault();
    if (selected?.type === "field" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      shiftSelectedField(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    const step = nudgeStep(event.shiftKey);
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    if (!moveSelection(state, selected, dx, dy)) return;
    markDirty();
    if (selected?.type === "zone") placeZoneBox(zoneById(selected.id));
    if (selected?.type === "table") placeTableCard(tableById(selected.id));
    growBoard();
    return;
  }
  if (event.key === "Delete" && !typing) {
    removeSelected();
  }
  if (event.key === "Escape") {
    closeDownloadMenu();
    setLinkMode(false);
    render();
  }
});
document.addEventListener("keyup", (event) => {
  if (event.key === "Shift") setShiftHold(false);
});
window.addEventListener("blur", () => setShiftHold(false));

window.addEventListener("resize", () => {
  applyCamera();
  drawWires();
});
window.addEventListener("beforeunload", () => {
  persistSession();
});

const restored = session.restore();
if (restored?.current) {
  state = session.snapshot();
  filename = restored.filename || "новый.dbml";
  selected = restored.selected || null;
  catalogToggle = restored.catalogToggle && typeof restored.catalogToggle === "object" ? restored.catalogToggle : {};
  savedJson = typeof restored.savedJson === "string" ? restored.savedJson : JSON.stringify(state);
  dirty = JSON.stringify(state) !== savedJson;
  const hasCamera =
    Number.isFinite(restored.zoom) && Number.isFinite(restored.panX) && Number.isFinite(restored.panY);
  if (hasCamera) {
    zoom = clampZoom(restored.zoom);
    panX = restored.panX;
    panY = restored.panY;
  }
  setMode(restored.mode === "edit" ? "edit" : "view");
  growBoard();
  if (hasCamera) applyCamera();
  else centerOnContent();
  setHint("Восстановлен последний файл и история правок. Новый или Открыть сотрут сессию.");
} else {
  session.reset(state);
  persistSession();
  setMode("view");
  applyCamera();
}
