import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import opentype from 'opentype.js';
import { artworkFromSvg, artworkFromText, fitContours } from './geom2d.js';
import {
  initManifold,
  localToolGeometry,
  prepareSolid,
  applyStamps,
  flipWinding,
  signedVolume,
} from './stamp.js';

const FONT_URL = 'https://cdn.jsdelivr.net/gh/googlefonts/roboto@2.138/src/hinted/Roboto-Regular.ttf';

const PRESETS = [
  {
    name: 'Круг',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/></svg>',
  },
  {
    name: 'Кольцо',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84zm0 22a20 20 0 1 0 0 40a20 20 0 1 0 0-40z"/></svg>',
  },
  {
    name: 'Звезда',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,6 61,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 39,38"/></svg>',
  },
  {
    name: 'Треугольник',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,8 94,88 6,88"/></svg>',
  },
];

const $ = (id) => document.getElementById(id);

const ui = {
  engine: $('engine'),
  hint: $('hint'),
  drop: $('drop'),
  busy: $('busy'),
  stage: $('stage'),
  fileStl: $('file-stl'),
  fileSvg: $('file-svg'),
  sample: $('btn-sample'),
  info: $('model-info'),
  color: $('die-color'),
  smooth: $('smooth'),
  flip: $('btn-flip'),
  fit: $('btn-fit'),
  tabText: $('tab-text'),
  tabSvg: $('tab-svg'),
  paneText: $('pane-text'),
  paneSvg: $('pane-svg'),
  text: $('text'),
  svg: $('svg'),
  editNote: $('edit-note'),
  presets: $('presets'),
  modeCut: $('mode-cut'),
  modeRaise: $('mode-raise'),
  height: $('height'),
  heightNum: $('height-num'),
  depth: $('depth'),
  depthNum: $('depth-num'),
  rotation: $('rotation'),
  rotationNum: $('rotation-num'),
  offU: $('off-u'),
  offV: $('off-v'),
  list: $('stamps'),
  deselect: $('btn-deselect'),
  apply: $('btn-apply'),
  undo: $('btn-undo'),
  reset: $('btn-reset'),
  download: $('btn-download'),
  status: $('status'),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a241c');
scene.add(new THREE.HemisphereLight(0xfff4e4, 0x3a3026, 0.9));
const key = new THREE.DirectionalLight(0xfff8ee, 1.5);
key.position.set(50, -90, 80);
scene.add(key);
const fill = new THREE.DirectionalLight(0xc5d4e4, 0.5);
fill.position.set(-70, 50, 30);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 5000);
camera.up.set(0, 0, 1);
camera.position.set(30, -40, 24);
const headlamp = new THREE.DirectionalLight(0xfff4e4, 0.5);
headlamp.position.set(12, -18, 8);
camera.add(headlamp);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
ui.stage.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const loader = new STLLoader();
const exporter = new STLExporter();

const cutMat = new THREE.MeshStandardMaterial({
  color: 0xe07a5f,
  transparent: true,
  opacity: 0.72,
  roughness: 0.35,
  metalness: 0.05,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const raiseMat = cutMat.clone();
raiseMat.color.set(0xe2b15a);
const cutMatOn = cutMat.clone();
cutMatOn.opacity = 0.92;
cutMatOn.emissive.set(0x8a2f16);
const raiseMatOn = raiseMat.clone();
raiseMatOn.opacity = 0.92;
raiseMatOn.emissive.set(0x7a5512);

function previewMaterial(stamp) {
  const on = stamp.id === selectedId;
  if (stamp.mode === 'raise') return on ? raiseMatOn : raiseMat;
  return on ? cutMatOn : cutMat;
}

let font = null;
let engineReady = false;
let kind = 'text';
let mode = 'cut';
let formLock = false;
let diceMesh = null;
let sourceGeometry = null;
let sourceName = 'dice';
let solidReady = false;
let stamps = [];
let selectedId = null;
let history = [];
let stampSeq = 1;
let busy = false;
const previews = new Map();
const rebuildTimers = new Map();

window.__diceApp = true;

function setStatus(text) {
  ui.status.textContent = text;
}

function setHint(text) {
  ui.hint.textContent = text;
}

function setBusy(on, label) {
  busy = on;
  ui.busy.hidden = !on;
  if (label) ui.busy.querySelector('span').textContent = label;
  syncButtons();
}

function num(input) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : 0;
}

function bindPair(range, field, onInput) {
  const sync = (source) => {
    if (formLock) return;
    const value = num(source);
    formLock = true;
    range.value = String(value);
    field.value = String(value);
    formLock = false;
    onInput();
  };
  range.addEventListener('input', () => sync(range));
  field.addEventListener('input', () => sync(field));
}

function setPair(range, field, value) {
  range.value = String(value);
  field.value = String(value);
}

function selectedStamp() {
  return stamps.find((stamp) => stamp.id === selectedId) || null;
}

function syncButtons() {
  const hasMesh = Boolean(diceMesh);
  ui.flip.disabled = !hasMesh || busy;
  ui.fit.disabled = !hasMesh || busy;
  ui.apply.disabled = !hasMesh || !solidReady || !engineReady || stamps.length === 0 || busy;
  ui.undo.disabled = history.length === 0 || busy;
  ui.reset.disabled = !sourceGeometry || busy;
  ui.download.disabled = !hasMesh || busy;
  const selected = selectedStamp();
  ui.deselect.hidden = !selected;
  ui.editNote.textContent = selected
    ? 'Правится выбранный штамп: изменения сразу видны на модели.'
    : 'Этот знак встанет по следующему клику на модели.';
}

function formatSize(geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const fmt = (n) => {
    const a = Math.abs(n);
    if (a >= 100) return n.toFixed(0);
    if (a >= 10) return n.toFixed(1);
    return n.toFixed(2);
  };
  const tris = geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
  const volume = Math.abs(signedVolume(geometry));
  return `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)} · ${Math.round(tris).toLocaleString('ru-RU')} треуг. · объём ${fmt(volume)}`;
}

function fitCamera() {
  if (!diceMesh) return;
  const box = new THREE.Box3().setFromObject(diceMesh);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.9, 1);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius, -radius * 1.25, radius * 0.85));
  camera.near = Math.max(radius / 800, 1e-4);
  camera.far = radius * 50;
  camera.updateProjectionMatrix();
  controls.update();
}

function replaceGeometry(geometry, { keepSource = false } = {}) {
  if (!diceMesh) {
    diceMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: ui.color.value,
      roughness: 0.48,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }));
    diceMesh.material.flatShading = !ui.smooth.checked;
    scene.add(diceMesh);
  } else {
    diceMesh.geometry.dispose();
    diceMesh.geometry = geometry;
  }
  if (!keepSource) {
    /* source stays the uploaded solid */
  }
  ui.info.textContent = formatSize(geometry);
  solidReady = true;
  syncButtons();
}

function showMeshOnly(geometry, message) {
  replaceGeometry(geometry);
  solidReady = false;
  ui.info.textContent = `${formatSize(geometry)} Этот STL нельзя резать: сетка не цельная.`;
  setStatus(message);
  syncButtons();
}

function clearStamps() {
  for (const mesh of previews.values()) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  previews.clear();
  stamps = [];
  selectedId = null;
  renderList();
}

function clearHistory() {
  for (const geometry of history) geometry.dispose();
  history = [];
}

async function adoptGeometry(raw, name, asSource, autoFlip = true) {
  clearStamps();
  if (asSource) clearHistory();
  let prepared;
  try {
    prepared = prepareSolid(raw, { autoFlip });
  } catch (error) {
    const geometry = error.geometry || raw;
    if (!sourceGeometry && asSource) sourceGeometry = geometry.clone();
    sourceName = name;
    showMeshOnly(geometry, error.message || 'Модель не цельная.');
    fitCamera();
    return;
  }
  if (asSource) {
    if (sourceGeometry) sourceGeometry.dispose();
    sourceGeometry = prepared.geometry.clone();
    sourceName = name;
  }
  replaceGeometry(prepared.geometry);
  fitCamera();
  const note = prepared.flipped ? ' Нормали смотрели внутрь, развернул их.' : '';
  setStatus(`Модель на сцене.${note} Кликните по грани, чтобы поставить знак.`);
  setHint('Клик — новый штамп. Поставленный штамп тянется мышью по поверхности');
}

async function loadArrayBuffer(buffer, name) {
  try {
    await enginePromise;
  } catch {
    return;
  }
  const geometry = loader.parse(buffer);
  if (!geometry.getAttribute('position') || geometry.getAttribute('position').count < 3) {
    setStatus('В файле нет треугольников.');
    return;
  }
  adoptGeometry(geometry, name.replace(/\.stl$/i, '') || 'dice', true);
}

function placementMatrix(stamp) {
  const z = stamp.normal.clone().normalize();
  const helper = Math.abs(z.z) < 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(helper, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  if (stamp.rotation) {
    const q = new THREE.Quaternion().setFromAxisAngle(z, THREE.MathUtils.degToRad(stamp.rotation));
    x.applyQuaternion(q);
    y.applyQuaternion(q);
  }
  const pos = stamp.point.clone()
    .addScaledVector(x, stamp.offsetU || 0)
    .addScaledVector(y, stamp.offsetV || 0);
  const matrix = new THREE.Matrix4().makeBasis(x, y, z);
  matrix.setPosition(pos);
  return matrix;
}

function matrixArray(matrix) {
  return Array.from(matrix.elements);
}

function positionPreview(stamp) {
  const mesh = previews.get(stamp.id);
  if (!mesh) return;
  const matrix = placementMatrix(stamp);
  mesh.position.setFromMatrixPosition(matrix);
  mesh.quaternion.setFromRotationMatrix(matrix);
  mesh.scale.set(1, 1, 1);
  const arrow = mesh.children[0];
  if (arrow && arrow.setLength) {
    const length = Math.max(stamp.height * 0.45, stamp.depth * 2, 0.4);
    arrow.setLength(length, length * 0.28, length * 0.16);
  }
}

function rebuildPreview(stamp) {
  let geometry;
  try {
    geometry = localToolGeometry(stamp.contours, stamp.fillRule, stamp.depth, stamp.mode);
  } catch (error) {
    setStatus(error.message || 'Не удалось построить знак.');
    return;
  }
  let mesh = previews.get(stamp.id);
  if (!mesh) {
    mesh = new THREE.Mesh(geometry, previewMaterial(stamp));
    mesh.raycast = () => {};
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0xf3eee6, 0.3, 0.16);
    mesh.add(arrow);
    scene.add(mesh);
    previews.set(stamp.id, mesh);
  } else {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    mesh.material = previewMaterial(stamp);
  }
  positionPreview(stamp);
}

// Fitted contours are centred on the origin, so the footprint is symmetric.
function shapeFor(sourceContours, height) {
  const contours = fitContours(sourceContours, height);
  let halfWidth = 0;
  let halfHeight = 0;
  for (const contour of contours) {
    for (const [x, y] of contour) {
      halfWidth = Math.max(halfWidth, Math.abs(x));
      halfHeight = Math.max(halfHeight, Math.abs(y));
    }
  }
  return { contours, halfWidth, halfHeight };
}

function scheduleRebuild(stamp) {
  clearTimeout(rebuildTimers.get(stamp.id));
  rebuildTimers.set(stamp.id, setTimeout(() => rebuildPreview(stamp), 40));
}

function stampLabel(stamp) {
  const raw = stamp.kind === 'text' ? stamp.source : 'SVG';
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 24) || 'знак';
  const how = stamp.mode === 'raise' ? 'поднять' : 'вдавить';
  return `${text} · ${how} · ${stamp.height}`;
}

function renderList() {
  ui.list.replaceChildren();
  for (const stamp of stamps) {
    const item = document.createElement('li');
    if (stamp.id === selectedId) item.classList.add('is-on');
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'pick';
    pick.textContent = stampLabel(stamp);
    pick.addEventListener('click', () => selectStamp(stamp.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'x';
    remove.textContent = '×';
    remove.title = 'Удалить штамп';
    remove.addEventListener('click', () => removeStamp(stamp.id));
    item.append(pick, remove);
    ui.list.append(item);
  }
  if (!stamps.length) {
    const item = document.createElement('li');
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = 'Пока пусто.';
    item.append(note);
    ui.list.append(item);
  }
  for (const stamp of stamps) {
    const mesh = previews.get(stamp.id);
    if (mesh) mesh.material = previewMaterial(stamp);
  }
  syncButtons();
}

function deselect() {
  if (selectedId == null) return;
  selectedId = null;
  renderList();
  setStatus('Выбор снят. Следующий клик по модели поставит новый штамп.');
}

function selectStamp(id) {
  const stamp = stamps.find((item) => item.id === id);
  if (!stamp) return;
  selectedId = id;
  formLock = true;
  setKind(stamp.kind);
  if (stamp.kind === 'text') ui.text.value = stamp.source;
  else ui.svg.value = stamp.source;
  mode = stamp.mode;
  ui.modeCut.classList.toggle('is-on', mode === 'cut');
  ui.modeRaise.classList.toggle('is-on', mode === 'raise');
  setPair(ui.height, ui.heightNum, stamp.height);
  setPair(ui.depth, ui.depthNum, stamp.depth);
  setPair(ui.rotation, ui.rotationNum, stamp.rotation);
  ui.offU.value = String(stamp.offsetU);
  ui.offV.value = String(stamp.offsetV);
  formLock = false;
  renderList();
  setStatus(`Выбран штамп «${stampLabel(stamp)}». Правьте знак в поле, тяните штамп мышью по модели.`);
}

function removeStamp(id) {
  stamps = stamps.filter((stamp) => stamp.id !== id);
  const mesh = previews.get(id);
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    previews.delete(id);
  }
  if (selectedId === id) selectedId = null;
  renderList();
}

function readArtwork() {
  if (kind === 'svg') {
    let svg = ui.svg.value.trim();
    if (!svg) throw new Error('Вставьте SVG или откройте файл.');
    if (!/<svg[\s>]/i.test(svg)) {
      if (/<(path|circle|polygon|rect|ellipse)\b/i.test(svg)) {
        svg = `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
      } else {
        throw new Error('Это не похоже на SVG.');
      }
    }
    const artwork = artworkFromSvg(svg);
    return { kind: 'svg', source: svg, ...artwork };
  }
  const text = ui.text.value.replace(/\r/g, '');
  if (!text.trim()) throw new Error('Введите текст или символ.');
  if (!font) throw new Error('Шрифт ещё не загрузился.');
  const artwork = artworkFromText(font, text, num(ui.height) || 6);
  return { kind: 'text', source: text, ...artwork };
}

function placeStamp(hit) {
  let artwork;
  try {
    artwork = readArtwork();
  } catch (error) {
    setStatus(error.message);
    return;
  }
  const height = Math.max(0.05, num(ui.height));
  let shape;
  try {
    shape = shapeFor(artwork.contours, height);
  } catch (error) {
    setStatus(error.message);
    return;
  }
  const normal = hit.face.normal.clone().transformDirection(diceMesh.matrixWorld).normalize();
  const stamp = {
    id: stampSeq++,
    kind: artwork.kind,
    source: artwork.source,
    sourceContours: artwork.contours,
    ...shape,
    fillRule: artwork.fillRule,
    mode,
    height,
    depth: Math.max(0.02, num(ui.depth)),
    rotation: 0,
    offsetU: 0,
    offsetV: 0,
    point: hit.point.clone(),
    normal,
  };
  stamps.push(stamp);
  formLock = true;
  setPair(ui.rotation, ui.rotationNum, 0);
  ui.offU.value = '0';
  ui.offV.value = '0';
  formLock = false;
  selectedId = stamp.id;
  rebuildPreview(stamp);
  renderList();
  if (artwork.missing && artwork.missing.length) {
    setStatus(`В шрифте нет: ${artwork.missing.join(' ')}. Такой знак лучше принести SVG.`);
  } else {
    setStatus('Штамп стоит на грани. Его можно тянуть мышью, править знак в поле или нанести на модель.');
  }
}

// Sits the stamp on the surface under the hit and tilts it to that face.
function seatStamp(stamp, hit) {
  stamp.point.copy(hit.point);
  stamp.normal.copy(hit.face.normal).transformDirection(diceMesh.matrixWorld).normalize();
  positionPreview(stamp);
}

function moveSelected(hit) {
  const stamp = selectedStamp();
  if (!stamp) return;
  seatStamp(stamp, hit);
  setStatus('Штамп перенесён.');
}

let sourceTimer = 0;

function scheduleSourceEdit() {
  if (formLock || selectedId == null) return;
  const id = selectedId;
  clearTimeout(sourceTimer);
  sourceTimer = setTimeout(() => {
    if (selectedId === id) applySourceEdit();
  }, 120);
}

// Rebuilds the selected stamp from whatever is in the active sign field.
function applySourceEdit() {
  const stamp = selectedStamp();
  if (!stamp) return false;
  let artwork;
  let shape;
  try {
    artwork = readArtwork();
    shape = shapeFor(artwork.contours, stamp.height);
  } catch (error) {
    setStatus(`${error.message} Штамп пока прежний.`);
    return false;
  }
  Object.assign(stamp, shape, {
    kind: artwork.kind,
    source: artwork.source,
    sourceContours: artwork.contours,
    fillRule: artwork.fillRule,
  });
  rebuildPreview(stamp);
  renderList();
  if (artwork.missing && artwork.missing.length) {
    setStatus(`В шрифте нет: ${artwork.missing.join(' ')}. Такой знак лучше принести SVG.`);
  } else {
    setStatus('Знак выбранного штампа обновлён.');
  }
  return true;
}

function useSvg(text, label) {
  ui.svg.value = text;
  setKind('svg');
  if (selectedStamp()) {
    if (applySourceEdit()) setStatus(`${label} теперь на выбранном штампе.`);
  } else {
    setStatus(`${label} в поле. Кликните по грани.`);
  }
}

function onGeomInput() {
  if (formLock) return;
  const stamp = selectedStamp();
  if (!stamp) return;
  const nextHeight = Math.max(0.05, num(ui.height));
  const nextDepth = Math.max(0.02, num(ui.depth));
  const shape = nextHeight !== stamp.height || nextDepth !== stamp.depth || mode !== stamp.mode;
  stamp.height = nextHeight;
  stamp.depth = nextDepth;
  stamp.mode = mode;
  stamp.rotation = num(ui.rotation);
  stamp.offsetU = num(ui.offU);
  stamp.offsetV = num(ui.offV);
  if (shape) {
    try {
      Object.assign(stamp, shapeFor(stamp.sourceContours, stamp.height));
    } catch (error) {
      setStatus(error.message);
      return;
    }
    scheduleRebuild(stamp);
  } else {
    positionPreview(stamp);
  }
  renderList();
}

function hitAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(diceMesh, false);
  const hit = hits[0];
  return hit && hit.face ? hit : null;
}

function screenPoint(world) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = world.clone().project(camera);
  return {
    x: rect.left + ((ndc.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - ndc.y) / 2) * rect.height,
  };
}

// Picks by the stamp's padded bounding box: thin glyphs would be hard to grab exactly.
function stampUnder(point) {
  const local = new THREE.Vector3();
  let best = null;
  let bestDistance = Infinity;
  for (const stamp of stamps) {
    local.copy(point).applyMatrix4(placementMatrix(stamp).invert());
    const pad = stamp.height * 0.15;
    if (Math.abs(local.x) > stamp.halfWidth + pad) continue;
    if (Math.abs(local.y) > stamp.halfHeight + pad) continue;
    if (Math.abs(local.z) > Math.max(stamp.height * 0.35, stamp.depth * 1.5)) continue;
    const distance = Math.hypot(local.x, local.y);
    if (distance < bestDistance) {
      best = stamp;
      bestDistance = distance;
    }
  }
  return best;
}

function dragTo(stamp, clientX, clientY) {
  const hit = hitAt(clientX, clientY);
  if (!hit) return false;
  // The slider offsets live in the old face's plane, so the drag absorbs them.
  stamp.offsetU = 0;
  stamp.offsetV = 0;
  seatStamp(stamp, hit);
  return true;
}

async function bake() {
  if (!diceMesh || !stamps.length || busy || !solidReady) return;
  setBusy(true, `Наношу ${stamps.length}…`);
  await new Promise((resolve) => setTimeout(resolve, 30));
  try {
    const jobs = stamps.map((stamp) => ({
      contours: stamp.contours,
      fillRule: stamp.fillRule,
      depth: stamp.depth,
      mode: stamp.mode,
      matrix: matrixArray(placementMatrix(stamp)),
    }));
    const next = applyStamps(diceMesh.geometry, jobs);
    history.push(diceMesh.geometry.clone());
    if (history.length > 8) history.shift().dispose();
    diceMesh.geometry.dispose();
    diceMesh.geometry = next;
    clearStamps();
    ui.info.textContent = formatSize(next);
    setStatus('Знаки в теле модели. Можно скачать STL или поставить ещё.');
  } catch (error) {
    setStatus(error.message || 'Булева операция не прошла.');
  } finally {
    setBusy(false);
  }
}

function undo() {
  const previous = history.pop();
  if (!previous || !diceMesh) return;
  clearStamps();
  diceMesh.geometry.dispose();
  diceMesh.geometry = previous;
  ui.info.textContent = formatSize(previous);
  solidReady = true;
  setStatus('Вернул модель до последнего нанесения.');
  syncButtons();
}

function resetSource() {
  if (!sourceGeometry) return;
  clearStamps();
  clearHistory();
  diceMesh.geometry.dispose();
  diceMesh.geometry = sourceGeometry.clone();
  solidReady = true;
  ui.info.textContent = formatSize(diceMesh.geometry);
  setStatus('Снова исходный STL.');
  syncButtons();
}

function download() {
  if (!diceMesh) return;
  const data = exporter.parse(diceMesh, { binary: true });
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const blob = new Blob([bytes], { type: 'model/stl' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${sourceName}-stamped.stl`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function setKind(next) {
  kind = next;
  const text = next === 'text';
  ui.tabText.classList.toggle('is-on', text);
  ui.tabSvg.classList.toggle('is-on', !text);
  ui.tabText.setAttribute('aria-selected', String(text));
  ui.tabSvg.setAttribute('aria-selected', String(!text));
  ui.paneText.hidden = !text;
  ui.paneSvg.hidden = text;
}

function setMode(next) {
  mode = next;
  ui.modeCut.classList.toggle('is-on', next === 'cut');
  ui.modeRaise.classList.toggle('is-on', next === 'raise');
  onGeomInput();
}

function resize() {
  const width = ui.stage.clientWidth;
  const height = ui.stage.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

ui.fileStl.addEventListener('change', () => {
  const file = ui.fileStl.files && ui.fileStl.files[0];
  if (!file) return;
  file.arrayBuffer().then((buffer) => loadArrayBuffer(buffer, file.name));
});

ui.sample.addEventListener('click', async () => {
  const response = await fetch('./samples/cube.stl');
  if (!response.ok) {
    setStatus('Не нашёл samples/cube.stl рядом со страницей.');
    return;
  }
  loadArrayBuffer(await response.arrayBuffer(), 'cube.stl');
});

ui.color.addEventListener('input', () => {
  if (diceMesh) diceMesh.material.color.set(ui.color.value);
});

ui.smooth.addEventListener('change', () => {
  if (!diceMesh) return;
  diceMesh.material.flatShading = !ui.smooth.checked;
  diceMesh.material.needsUpdate = true;
});

ui.flip.addEventListener('click', async () => {
  if (!diceMesh) return;
  await adoptGeometry(flipWinding(diceMesh.geometry), sourceName, false, false);
});

ui.fit.addEventListener('click', fitCamera);
ui.tabText.addEventListener('click', () => setKind('text'));
ui.tabSvg.addEventListener('click', () => setKind('svg'));
ui.modeCut.addEventListener('click', () => setMode('cut'));
ui.modeRaise.addEventListener('click', () => setMode('raise'));
ui.deselect.addEventListener('click', deselect);
ui.text.addEventListener('input', scheduleSourceEdit);
ui.svg.addEventListener('input', scheduleSourceEdit);
ui.apply.addEventListener('click', bake);
ui.undo.addEventListener('click', undo);
ui.reset.addEventListener('click', resetSource);
ui.download.addEventListener('click', download);

bindPair(ui.height, ui.heightNum, onGeomInput);
bindPair(ui.depth, ui.depthNum, onGeomInput);
bindPair(ui.rotation, ui.rotationNum, onGeomInput);
ui.offU.addEventListener('input', onGeomInput);
ui.offV.addEventListener('input', onGeomInput);

ui.fileSvg.addEventListener('change', () => {
  const file = ui.fileSvg.files && ui.fileSvg.files[0];
  if (!file) return;
  file.text().then((text) => useSvg(text, `SVG «${file.name}»`));
});

for (const preset of PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = preset.name;
  button.addEventListener('click', () => useSvg(preset.svg, `Заготовка «${preset.name}»`));
  ui.presets.append(button);
}

const canvas = renderer.domElement;
const CLICK_SLOP = 9;
let press = null;
let moveFrame = 0;
let lastMove = null;

function movedFar(event) {
  const dx = event.clientX - press.x;
  const dy = event.clientY - press.y;
  return dx * dx + dy * dy > CLICK_SLOP;
}

function queueMove(event) {
  lastMove = { x: event.clientX, y: event.clientY };
  if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
}

// Raycasts at most once per frame: big STLs make every ray expensive.
function flushMove() {
  moveFrame = 0;
  if (!lastMove || !diceMesh) return;
  const { x, y } = lastMove;
  if (press && press.stamp) {
    if (press.dragging) dragTo(press.stamp, x + press.dx, y + press.dy);
    return;
  }
  if (press) return;
  const hit = stamps.length ? hitAt(x, y) : null;
  canvas.style.cursor = hit && stampUnder(hit.point) ? 'grab' : '';
}

function endStampPress(done, event) {
  controls.enabled = true;
  cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  canvas.style.cursor = '';
  if (!done.dragging) return;
  if (event) dragTo(done.stamp, event.clientX + done.dx, event.clientY + done.dy);
  if (done.stamp.id === selectedId) {
    formLock = true;
    ui.offU.value = '0';
    ui.offV.value = '0';
    formLock = false;
  }
  setStatus('Штамп перенесён и лёг по поверхности.');
}

// Capture phase: this must run before OrbitControls so a grabbed stamp does not also spin the camera.
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || (press && press.stamp)) return;
  press = { id: event.pointerId, x: event.clientX, y: event.clientY, stamp: null, dragging: false };
  if (busy || !diceMesh || event.shiftKey || !stamps.length) return;
  const hit = hitAt(event.clientX, event.clientY);
  const stamp = hit && stampUnder(hit.point);
  if (!stamp) return;
  // Keep the grab point under the cursor instead of snapping the stamp centre to it.
  const anchor = screenPoint(new THREE.Vector3().setFromMatrixPosition(placementMatrix(stamp)));
  press.stamp = stamp;
  press.dx = anchor.x - event.clientX;
  press.dy = anchor.y - event.clientY;
  controls.enabled = false;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // The pointer can already be gone; the drag still works inside the canvas.
  }
  if (selectedId !== stamp.id) selectStamp(stamp.id);
}, { capture: true });

canvas.addEventListener('pointermove', (event) => {
  if (press && press.stamp) {
    if (event.pointerId !== press.id) return;
    if (!press.dragging) {
      if (!movedFar(event)) return;
      press.dragging = true;
      canvas.style.cursor = 'grabbing';
    }
    queueMove(event);
    return;
  }
  if (event.buttons === 0 && !busy) queueMove(event);
});

canvas.addEventListener('pointerup', (event) => {
  if (!press || event.pointerId !== press.id || event.button !== 0) return;
  const done = press;
  const wasClick = !movedFar(event);
  press = null;
  if (done.stamp) {
    endStampPress(done, event);
    return;
  }
  if (!wasClick || busy || !diceMesh) return;
  const hit = hitAt(event.clientX, event.clientY);
  if (!hit) {
    setStatus('Клик мимо модели.');
    return;
  }
  if (event.shiftKey && selectedStamp()) moveSelected(hit);
  else placeStamp(hit);
});

canvas.addEventListener('pointercancel', (event) => {
  if (!press || event.pointerId !== press.id) return;
  const done = press;
  press = null;
  if (done.stamp) endStampPress(done, null);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    deselect();
    return;
  }
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedId != null) {
      event.preventDefault();
      removeStamp(selectedId);
    }
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  }
});

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  ui.drop.hidden = false;
});
window.addEventListener('dragleave', (event) => {
  if (event.target === document.documentElement) ui.drop.hidden = true;
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  ui.drop.hidden = true;
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (!file) return;
  if (/\.svg$/i.test(file.name)) {
    file.text().then((text) => useSvg(text, `SVG «${file.name}»`));
    return;
  }
  if (/\.stl$/i.test(file.name)) {
    file.arrayBuffer().then((buffer) => loadArrayBuffer(buffer, file.name));
    return;
  }
  setStatus('Нужен файл STL или SVG.');
});

new ResizeObserver(resize).observe(ui.stage);
resize();
animate();
syncButtons();

if (location.protocol === 'file:') {
  ui.engine.textContent = 'Откройте через Docker или GitHub Pages';
  setStatus('Со страницы с диска модули не загрузятся. Поднимите контейнер или откройте сайт репозитория.');
}

const enginePromise = initManifold()
  .then(() => {
    engineReady = true;
    ui.engine.textContent = font ? 'Движок и шрифт готовы' : 'Движок готов';
    syncButtons();
  })
  .catch((error) => {
    ui.engine.textContent = 'Движок не загрузился';
    setStatus('Не удалось скачать расчёт геометрии. Проверьте интернет.');
    throw error;
  });

opentype.load(FONT_URL, (error, loaded) => {
  if (error || !loaded) {
    setStatus('Шрифт не загрузился. Текст недоступен, SVG работает.');
    return;
  }
  font = loaded;
  if (engineReady) ui.engine.textContent = 'Движок и шрифт готовы';
});
