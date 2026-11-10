import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { artworkFromSvg, fitContours } from './geom2d.js?v=4';
import {
  initManifold,
  localToolGeometry,
  prepareSolid,
  applyStamps,
  flipWinding,
  signedVolume,
} from './stamp.js?v=4';
import {
  LANGS,
  AppError,
  t,
  msg,
  render,
  errorMsg,
  getLang,
  setLang,
  onLangChange,
  applyI18n,
  locale,
} from './i18n.js?v=4';
import { cacheGet, cacheSet, cacheDel } from './store.js?v=4';
import {
  DEFAULT_FONT,
  EMOJI_CSS_FAMILY,
  loadBuiltinFont,
  ensureEmoji,
  listFonts,
  hasFont,
  fontName,
  addFont,
  addFontFromFile,
  addFontFromUrl,
  removeFont,
  customFonts,
  needsEmoji,
  layoutText,
} from './fonts.js?v=4';
import { LIBRARIES, library, loadLibrary, searchItems } from './symbols.js?v=4';
import { createRoller } from './roll.js?v=4';
import {
  PROJECT_APP,
  PROJECT_VERSION,
  PROJECT_EXT,
  toBase64,
  fromBase64,
  packGeometry,
  unpackGeometry,
  encodeGeometry,
  decodeGeometry,
  stampToData,
  stampFromData,
} from './project.js?v=4';

const THEMES = ['midnight', 'day', 'contrast', 'sepia'];
const THEME_KEY = 'dice.theme';
const HISTORY_LIMIT = 8;
const EMOJI_LIMIT = 240;
const ICON_LIMIT = 120;

const PRESETS = [
  {
    key: 'preset.circle',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/></svg>',
  },
  {
    key: 'preset.ring',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84zm0 22a20 20 0 1 0 0 40a20 20 0 1 0 0-40z"/></svg>',
  },
  {
    key: 'preset.star',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,6 61,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 39,38"/></svg>',
  },
  {
    key: 'preset.triangle',
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
  lang: $('lang'),
  theme: $('theme'),
  roll: $('btn-roll'),
  fileProject: $('file-project'),
  saveProject: $('btn-save-project'),
  newProject: $('btn-new'),
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
  tabSymbols: $('tab-symbols'),
  paneText: $('pane-text'),
  paneSvg: $('pane-svg'),
  paneSymbols: $('pane-symbols'),
  text: $('text'),
  font: $('font'),
  fontRemove: $('btn-font-remove'),
  fileFont: $('file-font'),
  fontUrl: $('font-url'),
  fontLoad: $('btn-font-url'),
  svg: $('svg'),
  editNote: $('edit-note'),
  presets: $('presets'),
  symLib: $('sym-lib'),
  symQuery: $('sym-query'),
  symInfo: $('sym-info'),
  symGrid: $('sym-grid'),
  symCredit: $('sym-credit'),
  symNow: $('sym-now'),
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
  auto: $('auto'),
  dir: $('btn-dir'),
  dirClear: $('btn-dir-clear'),
  dirName: $('dir-name'),
  download: $('btn-download'),
  status: $('status'),
};

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(cssVar('--scene', '#2a241c'));
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
const roller = createRoller();

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

let engineReady = false;
let fontReady = false;
// What the next click stamps: 'text' reads the text field, 'svg' the SVG field.
let kind = 'text';
// Which tab is open. The symbol picker is a third tab that feeds one of the two fields.
let pane = 'text';
let svgLabel = '';
let mode = 'cut';
let formLock = false;
let diceMesh = null;
let sourceGeometry = null;
let sourceSolid = false;
let sourceName = 'dice';
let solidReady = false;
let modelStats = null;
let stamps = [];
let selectedId = null;
// Baked stamps as { label, normal }: the tray reads a throw by the mark that faces up.
let marks = [];
let history = [];
let stampSeq = 1;
let busy = false;
let exportDir = null;
const canPickDir = typeof window.showDirectoryPicker === 'function';
const previews = new Map();
const rebuildTimers = new Map();

// Shown texts are kept as message keys so a language switch can redraw them.
const live = {
  status: msg('status.start'),
  hint: msg('hint.start'),
  engine: msg('engine.loading'),
  busy: msg('busy.working'),
};

window.__diceApp = true;

function asMessage(keyOrMessage, params) {
  return typeof keyOrMessage === 'string' ? msg(keyOrMessage, params) : keyOrMessage;
}

function setStatus(keyOrMessage, params) {
  live.status = asMessage(keyOrMessage, params);
  ui.status.textContent = render(live.status);
}

function setHint(keyOrMessage, params) {
  live.hint = asMessage(keyOrMessage, params);
  ui.hint.textContent = render(live.hint);
}

function setEngine(keyOrMessage) {
  live.engine = asMessage(keyOrMessage);
  ui.engine.textContent = render(live.engine);
}

function setBusy(on, keyOrMessage, params) {
  busy = on;
  if (keyOrMessage) live.busy = asMessage(keyOrMessage, params);
  ui.busy.querySelector('span').textContent = render(live.busy);
  ui.busy.hidden = !on;
  syncButtons();
}

// Lets the overlay paint before a long synchronous calculation blocks the page.
function nextPaint() {
  return new Promise((resolve) => setTimeout(resolve, 30));
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

function signSummary() {
  if (kind === 'svg') return svgLabel || 'SVG';
  return ui.text.value.replace(/\s+/g, ' ').trim().slice(0, 24) || '—';
}

function syncButtons() {
  const hasMesh = Boolean(diceMesh);
  ui.flip.disabled = !hasMesh || busy;
  ui.fit.disabled = !hasMesh || busy;
  ui.roll.disabled = !hasMesh || busy;
  ui.saveProject.disabled = !hasMesh || busy;
  ui.newProject.disabled = !hasMesh || busy;
  ui.apply.disabled = !hasMesh || !solidReady || !engineReady || stamps.length === 0 || busy;
  ui.undo.disabled = history.length === 0 || busy;
  ui.reset.disabled = !sourceGeometry || busy;
  ui.download.disabled = !hasMesh || busy;
  ui.fontRemove.disabled = !hasFont(ui.font.value) || ui.font.value === DEFAULT_FONT;
  const selected = selectedStamp();
  ui.deselect.hidden = !selected;
  ui.editNote.textContent = t(selected ? 'sign.noteEditing' : 'sign.noteNext');
  ui.symNow.textContent = t('sym.now', { what: signSummary() });
}

function formatNumber(n) {
  const a = Math.abs(n);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return Number(n.toFixed(digits)).toLocaleString(locale());
}

function measure(geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const position = geometry.getAttribute('position');
  modelStats = {
    size,
    triangles: Math.round((geometry.index ? geometry.index.count : position.count) / 3),
    volume: Math.abs(signedVolume(geometry)),
  };
}

function renderInfo() {
  if (!diceMesh || !modelStats) {
    ui.info.textContent = t('model.none');
    return;
  }
  const text = t('model.info', {
    x: formatNumber(modelStats.size.x),
    y: formatNumber(modelStats.size.y),
    z: formatNumber(modelStats.size.z),
    triangles: modelStats.triangles.toLocaleString(locale()),
    volume: formatNumber(modelStats.volume),
  });
  ui.info.textContent = solidReady ? text : `${text} ${t('model.notSolid')}`;
}

function modelRadius() {
  const box = new THREE.Box3().setFromObject(diceMesh);
  return {
    center: box.getCenter(new THREE.Vector3()),
    radius: Math.max(box.getSize(new THREE.Vector3()).length() * 0.9, 1),
  };
}

function setClipping(radius) {
  camera.near = Math.max(radius / 800, 1e-4);
  camera.far = radius * 50;
  camera.updateProjectionMatrix();
}

function fitCamera() {
  if (!diceMesh) return;
  const { center, radius } = modelRadius();
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius, -radius * 1.25, radius * 0.85));
  setClipping(radius);
  controls.update();
  touch();
}

function showGeometry(geometry, solid) {
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
  solidReady = solid;
  measure(geometry);
  renderInfo();
  syncButtons();
}

function removeModel() {
  if (diceMesh) {
    scene.remove(diceMesh);
    diceMesh.geometry.dispose();
    diceMesh.material.dispose();
    diceMesh = null;
  }
  if (sourceGeometry) {
    sourceGeometry.dispose();
    sourceGeometry = null;
  }
  sourceSolid = false;
  solidReady = false;
  modelStats = null;
  marks = [];
}

function clearStamps() {
  for (const timer of rebuildTimers.values()) clearTimeout(timer);
  rebuildTimers.clear();
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
  for (const entry of history) entry.geometry.dispose();
  history = [];
}

function adoptGeometry(raw, name, asSource, autoFlip = true) {
  clearStamps();
  if (asSource) {
    clearHistory();
    marks = [];
  }
  let geometry;
  let solid = true;
  let flipped = false;
  let failure = null;
  try {
    const prepared = prepareSolid(raw, { autoFlip });
    geometry = prepared.geometry;
    flipped = prepared.flipped;
  } catch (error) {
    geometry = error.geometry || raw;
    solid = false;
    failure = error;
  }
  if (asSource) {
    if (sourceGeometry) sourceGeometry.dispose();
    sourceGeometry = geometry.clone();
    sourceSolid = solid;
    sourceName = name;
  }
  showGeometry(geometry, solid);
  if (asSource) fitCamera();
  if (failure) {
    setStatus(errorMsg(failure, 'err.solid.open'));
    setHint('hint.notSolid');
  } else {
    setStatus(flipped ? 'status.modelFlipped' : 'status.modelReady');
    setHint('hint.ready');
  }
  saveModel();
  if (asSource) saveSource();
  touch();
}

async function loadArrayBuffer(buffer, name) {
  try {
    await enginePromise;
  } catch {
    return;
  }
  let geometry;
  try {
    geometry = loader.parse(buffer);
  } catch {
    setStatus('err.stlParse');
    return;
  }
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) {
    setStatus('err.stlEmpty');
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

function stampJobs() {
  return stamps.map((stamp) => ({
    contours: stamp.contours,
    fillRule: stamp.fillRule,
    depth: stamp.depth,
    mode: stamp.mode,
    matrix: Array.from(placementMatrix(stamp).elements),
  }));
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
    setStatus(errorMsg(error, 'err.stampBuild'));
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

function stampName(stamp) {
  const raw = stamp.kind === 'text' ? stamp.source : stamp.label || 'SVG';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 24) || '—';
}

function stampLabel(stamp) {
  return t('stamps.item', {
    what: stampName(stamp),
    how: t(stamp.mode === 'raise' ? 'how.raiseShort' : 'how.cutShort'),
    height: stamp.height,
  });
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
    remove.title = t('stamps.remove');
    remove.setAttribute('aria-label', t('stamps.remove'));
    remove.addEventListener('click', () => removeStamp(stamp.id));
    item.append(pick, remove);
    ui.list.append(item);
  }
  if (!stamps.length) {
    const item = document.createElement('li');
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = t('stamps.empty');
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
  setStatus('status.deselected');
  touch();
}

// Loads the stamp's sign and numbers into the form. The symbol tab stays open if the user is in it.
function showStampInForm(stamp) {
  formLock = true;
  kind = stamp.kind;
  if (stamp.kind === 'text') {
    ui.text.value = stamp.source;
    if (hasFont(stamp.fontId)) ui.font.value = stamp.fontId;
  } else {
    ui.svg.value = stamp.source;
    svgLabel = stamp.label || '';
  }
  if (pane !== 'symbols') showPane(stamp.kind);
  mode = stamp.mode;
  ui.modeCut.classList.toggle('is-on', mode === 'cut');
  ui.modeRaise.classList.toggle('is-on', mode === 'raise');
  setPair(ui.height, ui.heightNum, stamp.height);
  setPair(ui.depth, ui.depthNum, stamp.depth);
  setPair(ui.rotation, ui.rotationNum, stamp.rotation);
  ui.offU.value = String(stamp.offsetU);
  ui.offV.value = String(stamp.offsetV);
  formLock = false;
}

function selectStamp(id) {
  const stamp = stamps.find((item) => item.id === id);
  if (!stamp) return;
  selectedId = id;
  showStampInForm(stamp);
  renderList();
  setStatus('status.selected', { label: stampLabel(stamp) });
  touch();
}

function removeStamp(id) {
  stamps = stamps.filter((stamp) => stamp.id !== id);
  clearTimeout(rebuildTimers.get(id));
  rebuildTimers.delete(id);
  const mesh = previews.get(id);
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    previews.delete(id);
  }
  if (selectedId === id) selectedId = null;
  renderList();
  touch();
}

async function readArtwork() {
  if (kind === 'svg') {
    let svg = ui.svg.value.trim();
    if (!svg) throw new AppError('err.svgEmpty');
    if (!/<svg[\s>]/i.test(svg)) {
      if (!/<(path|circle|polygon|rect|ellipse)\b/i.test(svg)) throw new AppError('err.notSvg');
      svg = `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
    }
    return { kind: 'svg', source: svg, label: svgLabel, fontId: '', ...artworkFromSvg(svg) };
  }
  const text = ui.text.value.replace(/\r/g, '');
  if (!text.trim()) throw new AppError('err.textEmpty');
  if (!fontReady) throw new AppError('err.fontNotReady');
  const fontId = hasFont(ui.font.value) ? ui.font.value : DEFAULT_FONT;
  if (needsEmoji(fontId, text)) {
    try {
      await ensureEmoji();
    } catch {
      // Without the emoji font the characters are simply reported as missing below.
    }
  }
  return { kind: 'text', source: text, label: '', fontId, ...layoutText(fontId, text, 10) };
}

function missingMessage(artwork) {
  return artwork.missing && artwork.missing.length
    ? msg('status.missing', { chars: artwork.missing.join(' ') })
    : null;
}

async function placeStamp(hit) {
  const point = hit.point.clone();
  const normal = hit.face.normal.clone().transformDirection(diceMesh.matrixWorld).normalize();
  const height = Math.max(0.05, num(ui.height));
  let artwork;
  let shape;
  try {
    artwork = await readArtwork();
    shape = shapeFor(artwork.contours, height);
  } catch (error) {
    setStatus(errorMsg(error));
    return;
  }
  if (!diceMesh) return;
  const stamp = {
    id: stampSeq++,
    kind: artwork.kind,
    source: artwork.source,
    label: artwork.label,
    fontId: artwork.fontId,
    sourceContours: artwork.contours,
    ...shape,
    fillRule: artwork.fillRule,
    mode,
    height,
    depth: Math.max(0.02, num(ui.depth)),
    rotation: 0,
    offsetU: 0,
    offsetV: 0,
    point,
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
  setStatus(missingMessage(artwork) || msg('status.placed'));
  touch();
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
  setStatus('status.moved');
  touch();
}

let sourceTimer = 0;

function scheduleSourceEdit() {
  touch();
  syncButtons();
  if (formLock || selectedId == null) return;
  const id = selectedId;
  clearTimeout(sourceTimer);
  sourceTimer = setTimeout(() => {
    if (selectedId === id) applySourceEdit();
  }, 120);
}

// Rebuilds the selected stamp from whatever is in the active sign field.
async function applySourceEdit() {
  const stamp = selectedStamp();
  if (!stamp) return false;
  let artwork;
  let shape;
  try {
    artwork = await readArtwork();
    shape = shapeFor(artwork.contours, stamp.height);
  } catch (error) {
    setStatus('status.editKept', { reason: errorMsg(error) });
    return false;
  }
  if (!stamps.includes(stamp)) return false;
  Object.assign(stamp, shape, {
    kind: artwork.kind,
    source: artwork.source,
    label: artwork.label,
    fontId: artwork.fontId,
    sourceContours: artwork.contours,
    fillRule: artwork.fillRule,
  });
  rebuildPreview(stamp);
  renderList();
  setStatus(missingMessage(artwork) || msg('status.signUpdated'));
  touch();
  return true;
}

// A sign was picked from a file, a preset or the symbol library.
async function signChosen(label) {
  touch();
  syncButtons();
  if (selectedStamp()) {
    if (await applySourceEdit()) setStatus('status.signOnStamp', { label });
  } else {
    setStatus('status.signReady', { label });
  }
}

function useSvg(text, label) {
  ui.svg.value = text;
  svgLabel = label;
  kind = 'svg';
  if (pane !== 'symbols') showPane('svg');
  signChosen(label);
}

function onGeomInput() {
  if (formLock) return;
  touch();
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
      setStatus(errorMsg(error));
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

function markOf(stamp) {
  return { label: stampName(stamp), normal: stamp.normal.toArray() };
}

// Cuts or adds every placed stamp. Resolves to false when the boolean failed.
async function bake() {
  if (!diceMesh || !stamps.length || busy || !solidReady) return false;
  setBusy(true, 'busy.baking', { n: stamps.length });
  await nextPaint();
  try {
    const next = applyStamps(diceMesh.geometry, stampJobs());
    history.push({ geometry: diceMesh.geometry, marks: marks.length });
    if (history.length > HISTORY_LIMIT) history.shift().geometry.dispose();
    marks = marks.concat(stamps.map(markOf));
    diceMesh.geometry = next;
    clearStamps();
    measure(next);
    renderInfo();
    setStatus('status.baked');
    saveModel();
    touch();
    return true;
  } catch (error) {
    setStatus(errorMsg(error, 'err.boolean'));
    return false;
  } finally {
    setBusy(false);
  }
}

function undo() {
  const previous = history.pop();
  if (!previous || !diceMesh) return;
  clearStamps();
  diceMesh.geometry.dispose();
  diceMesh.geometry = previous.geometry;
  marks = marks.slice(0, previous.marks);
  solidReady = true;
  measure(previous.geometry);
  renderInfo();
  setStatus('status.undone');
  syncButtons();
  saveModel();
  touch();
}

function resetSource() {
  if (!sourceGeometry || !diceMesh) return;
  clearStamps();
  clearHistory();
  marks = [];
  showGeometry(sourceGeometry.clone(), sourceSolid);
  setStatus('status.reset');
  saveModel();
  touch();
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'dice';
}

function downloadBlob(name, blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

// Asks for write access while the click is still fresh: the browser refuses after a long calculation.
async function exportDirReady() {
  if (!exportDir) return false;
  try {
    const options = { mode: 'readwrite' };
    let state = await exportDir.queryPermission(options);
    if (state !== 'granted') state = await exportDir.requestPermission(options);
    return state === 'granted';
  } catch {
    return false;
  }
}

// Writes into the chosen folder, or hands the file to the browser's downloads when that is not possible.
async function saveFile(name, blob, toDir) {
  if (toDir && exportDir) {
    try {
      const handle = await exportDir.getFileHandle(name, { create: true });
      const writer = await handle.createWritable();
      await writer.write(blob);
      await writer.close();
      return msg('where.folder', { name: exportDir.name });
    } catch {
      downloadBlob(name, blob);
      return msg('where.folderFailed', { name: exportDir.name });
    }
  }
  downloadBlob(name, blob);
  return msg(exportDir ? 'where.folderDenied' : 'where.downloads', exportDir ? { name: exportDir.name } : undefined);
}

// Welds the mesh, checks it is one closed body and turns the normals outward.
function tidyModel() {
  let prepared;
  try {
    prepared = prepareSolid(diceMesh.geometry, { autoFlip: true });
  } catch {
    return msg('export.tidyBroken');
  }
  const before = diceMesh.geometry.getAttribute('position').count;
  const after = prepared.geometry.getAttribute('position').count;
  if (!prepared.flipped && before === after) {
    prepared.geometry.dispose();
    return msg('export.tidyOk');
  }
  showGeometry(prepared.geometry, true);
  saveModel();
  return msg(prepared.flipped ? 'export.tidyFlipped' : 'export.tidyWelded');
}

async function exportStl() {
  if (!diceMesh || busy) return;
  const toDir = await exportDirReady();
  const pending = stamps.length;
  let note;
  if (!ui.auto.checked) {
    note = pending ? msg('export.pendingLeft', { n: pending }) : msg('export.asIs');
  } else if (!solidReady || !engineReady) {
    note = msg(pending ? 'export.brokenPending' : 'export.tidyBroken');
  } else {
    if (pending && !(await bake())) return;
    setBusy(true, 'busy.checking');
    await nextPaint();
    try {
      note = tidyModel();
    } finally {
      setBusy(false);
    }
    if (pending) note = msg('export.baked', { n: pending, note });
  }
  const data = exporter.parse(diceMesh, { binary: true });
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const name = `${safeFileName(sourceName)}-stamped.stl`;
  const where = await saveFile(name, new Blob([bytes], { type: 'model/stl' }), toDir);
  setStatus('status.exported', { file: name, where, note });
}

function showPane(next) {
  pane = next;
  const tabs = [[ui.tabText, ui.paneText, 'text'], [ui.tabSvg, ui.paneSvg, 'svg'], [ui.tabSymbols, ui.paneSymbols, 'symbols']];
  for (const [tab, box, name] of tabs) {
    tab.classList.toggle('is-on', name === next);
    tab.setAttribute('aria-selected', String(name === next));
    box.hidden = name !== next;
  }
}

function setPane(next) {
  showPane(next);
  if (next === 'symbols') {
    if (symbols.phase === 'idle') loadSymbols();
  } else {
    kind = next;
  }
  syncButtons();
  touch();
}

function setMode(next) {
  mode = next;
  ui.modeCut.classList.toggle('is-on', next === 'cut');
  ui.modeRaise.classList.toggle('is-on', next === 'raise');
  onGeomInput();
  touch();
}

// ---- Fonts ----

function refreshFontList(selectId) {
  const wanted = selectId || ui.font.value || DEFAULT_FONT;
  ui.font.replaceChildren();
  for (const entry of listFonts()) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    ui.font.append(option);
  }
  ui.font.value = hasFont(wanted) ? wanted : DEFAULT_FONT;
  syncButtons();
}

async function fontAdded(entry) {
  refreshFontList(entry.id);
  saveFonts();
  touch();
  if (kind === 'text' && selectedStamp()) await applySourceEdit();
  setStatus('status.fontAdded', { name: entry.name });
}

async function addFontFile(file) {
  try {
    await fontAdded(await addFontFromFile(file));
  } catch (error) {
    setStatus(errorMsg(error, 'err.fontParse'));
  }
}

async function addFontLink() {
  const value = ui.fontUrl.value;
  ui.fontLoad.disabled = true;
  setStatus('status.fontLoading');
  try {
    await fontAdded(await addFontFromUrl(value));
    ui.fontUrl.value = '';
  } catch (error) {
    setStatus(errorMsg(error, 'err.fontFetch'));
  } finally {
    ui.fontLoad.disabled = false;
  }
}

function dropFont() {
  const id = ui.font.value;
  const name = fontName(id);
  if (!removeFont(id)) return;
  refreshFontList(DEFAULT_FONT);
  saveFonts();
  touch();
  setStatus('status.fontRemoved', { name });
}

// ---- Symbol libraries ----

// phase: 'idle' | 'loading' | 'ready' | 'failed'
const symbols = { phase: 'idle', items: [], error: null, token: 0, shown: 0, total: 0 };

async function loadSymbols() {
  const lib = library(ui.symLib.value);
  const token = ++symbols.token;
  symbols.phase = 'loading';
  symbols.items = [];
  renderSymbols();
  try {
    const items = await loadLibrary(lib.id, getLang());
    if (token !== symbols.token) return;
    symbols.items = items;
    symbols.phase = 'ready';
  } catch (error) {
    if (token !== symbols.token) return;
    symbols.error = errorMsg(error, 'err.libFetch');
    symbols.phase = 'failed';
  }
  renderSymbols();
}

function symbolButton(lib, item, ink) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sym';
  button.title = item.label;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-label', item.label);
  if (lib.type === 'emoji') {
    button.textContent = item.char;
    button.style.fontFamily = `${EMOJI_CSS_FAMILY}, sans-serif`;
  } else {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = `data:image/svg+xml;utf8,${encodeURIComponent(item.svg.replace(/currentColor/g, ink))}`;
    button.append(image);
  }
  button.addEventListener('click', () => pickSymbol(lib, item));
  return button;
}

function renderSymbols() {
  const lib = library(ui.symLib.value);
  ui.symCredit.replaceChildren();
  const link = document.createElement('a');
  link.href = lib.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = lib.name;
  ui.symCredit.append(link, ` · ${lib.license}`);

  if (symbols.phase !== 'ready') {
    ui.symGrid.replaceChildren();
    if (symbols.phase === 'loading') ui.symInfo.textContent = t('sym.loading', { name: lib.name });
    else if (symbols.phase === 'failed') ui.symInfo.textContent = render(symbols.error);
    else ui.symInfo.textContent = '';
    return;
  }
  const limit = lib.type === 'emoji' ? EMOJI_LIMIT : ICON_LIMIT;
  const found = searchItems(symbols.items, ui.symQuery.value, limit);
  const ink = cssVar('--text', '#f3eee6');
  ui.symGrid.replaceChildren(...found.items.map((item) => symbolButton(lib, item, ink)));
  const count = found.total
    ? t('sym.shown', { shown: found.items.length, total: found.total.toLocaleString(locale()) })
    : t('sym.nothing');
  ui.symInfo.textContent = lib.type === 'icons' ? `${count} ${t('sym.english')}` : count;
}

function pickSymbol(lib, item) {
  if (lib.type === 'emoji') {
    ui.text.value = item.char;
    kind = 'text';
    signChosen(`${item.char} ${item.label}`);
    return;
  }
  ui.svg.value = item.svg;
  svgLabel = item.label;
  kind = 'svg';
  signChosen(`${item.label} (${lib.name})`);
}

let symbolTimer = 0;

function scheduleSymbolSearch() {
  clearTimeout(symbolTimer);
  symbolTimer = setTimeout(renderSymbols, 140);
  touch();
}

// ---- Cache and project files ----

// Nothing is written before the saved scene has been read back, or a reload would wipe it.
let cacheOpen = false;
let cacheWarned = false;
let saveTimer = 0;

function store(name, value) {
  return cacheSet(name, value).catch(() => {
    if (cacheWarned) return;
    cacheWarned = true;
    setStatus('status.cacheFailed');
  });
}

function formData() {
  return {
    kind,
    pane,
    text: ui.text.value,
    svg: ui.svg.value,
    svgLabel,
    fontId: ui.font.value,
    mode,
    height: num(ui.height),
    depth: num(ui.depth),
    color: ui.color.value,
    smooth: ui.smooth.checked,
    auto: ui.auto.checked,
    symLib: ui.symLib.value,
    symQuery: ui.symQuery.value,
  };
}

function sessionData() {
  return {
    name: sourceName,
    solid: solidReady,
    sourceSolid,
    selectedId,
    stamps: stamps.map(stampToData),
    marks: marks.map((mark) => ({ label: mark.label, normal: mark.normal.slice() })),
    form: formData(),
    view: { position: camera.position.toArray(), target: controls.target.toArray() },
  };
}

function saveSession() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (cacheOpen) store('session', sessionData());
}

function touch() {
  if (!cacheOpen) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 250);
}

function saveModel() {
  if (!cacheOpen) return;
  if (diceMesh) store('model', packGeometry(diceMesh.geometry));
  else cacheDel('model').catch(() => {});
}

function saveSource() {
  if (!cacheOpen) return;
  if (sourceGeometry) store('source', packGeometry(sourceGeometry));
  else cacheDel('source').catch(() => {});
}

function saveFonts() {
  if (cacheOpen) store('fonts', customFonts());
}

function applyForm(form) {
  if (!form || typeof form !== 'object') return;
  formLock = true;
  if (typeof form.text === 'string') ui.text.value = form.text;
  if (typeof form.svg === 'string') ui.svg.value = form.svg;
  svgLabel = typeof form.svgLabel === 'string' ? form.svgLabel : '';
  if (hasFont(form.fontId)) ui.font.value = form.fontId;
  mode = form.mode === 'raise' ? 'raise' : 'cut';
  ui.modeCut.classList.toggle('is-on', mode === 'cut');
  ui.modeRaise.classList.toggle('is-on', mode === 'raise');
  if (Number.isFinite(form.height) && form.height > 0) setPair(ui.height, ui.heightNum, form.height);
  if (Number.isFinite(form.depth) && form.depth > 0) setPair(ui.depth, ui.depthNum, form.depth);
  if (typeof form.color === 'string' && /^#[0-9a-f]{6}$/i.test(form.color)) ui.color.value = form.color;
  ui.smooth.checked = Boolean(form.smooth);
  if (typeof form.auto === 'boolean') ui.auto.checked = form.auto;
  if (LIBRARIES.some((lib) => lib.id === form.symLib)) ui.symLib.value = form.symLib;
  if (typeof form.symQuery === 'string') ui.symQuery.value = form.symQuery;
  kind = form.kind === 'svg' ? 'svg' : 'text';
  formLock = false;
  const nextPane = ['text', 'svg', 'symbols'].includes(form.pane) ? form.pane : kind;
  showPane(nextPane);
  symbols.phase = 'idle';
  symbols.items = [];
  if (nextPane === 'symbols') loadSymbols();
  else renderSymbols();
}

function readMarks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const mark of list) {
    const n = mark && mark.normal;
    if (!Array.isArray(n) || n.length !== 3 || !n.every((value) => Number.isFinite(value))) continue;
    out.push({ label: String(mark.label ?? ''), normal: n.slice() });
  }
  return out;
}

function vectorFrom(list) {
  return Array.isArray(list) && list.length === 3 && list.every((value) => Number.isFinite(value))
    ? new THREE.Vector3().fromArray(list)
    : null;
}

// Rebuilds the whole scene from saved data. Returns how many stamps could not be read.
function applyScene(session, geometry, source) {
  clearStamps();
  clearHistory();
  removeModel();
  applyForm(session.form);
  let skipped = 0;
  if (geometry) {
    sourceName = String(session.name || 'dice');
    sourceGeometry = source || geometry.clone();
    sourceSolid = source ? session.sourceSolid !== false : session.solid !== false;
    showGeometry(geometry, session.solid !== false);
    diceMesh.material.color.set(ui.color.value);
    diceMesh.material.flatShading = !ui.smooth.checked;
    diceMesh.material.needsUpdate = true;
    marks = readMarks(session.marks);

    const used = new Set();
    for (const data of Array.isArray(session.stamps) ? session.stamps : []) {
      try {
        const stamp = stampFromData(data);
        Object.assign(stamp, shapeFor(stamp.sourceContours, stamp.height));
        while (used.has(stamp.id)) stamp.id += 1;
        used.add(stamp.id);
        stamps.push(stamp);
        rebuildPreview(stamp);
      } catch {
        skipped += 1;
      }
    }
    stampSeq = stamps.reduce((max, stamp) => Math.max(max, stamp.id), 0) + 1;

    const position = vectorFrom(session.view && session.view.position);
    const target = vectorFrom(session.view && session.view.target);
    if (position && target && position.distanceToSquared(target) > 1e-12) {
      camera.position.copy(position);
      controls.target.copy(target);
      setClipping(modelRadius().radius);
      controls.update();
    } else {
      fitCamera();
    }
    setHint(session.solid !== false ? 'hint.ready' : 'hint.notSolid');
  } else {
    setHint('hint.start');
  }
  const chosen = stamps.find((stamp) => stamp.id === session.selectedId);
  if (chosen) {
    selectedId = chosen.id;
    showStampInForm(chosen);
  }
  renderList();
  renderInfo();
  return skipped;
}

async function restoreCache() {
  if (!engineReady) return;
  let saved;
  try {
    saved = await Promise.all(['session', 'model', 'source', 'fonts', 'dir'].map((name) => cacheGet(name)));
  } catch {
    // No IndexedDB (private window, blocked storage): the app works, it just forgets on reload.
    cacheOpen = true;
    return;
  }
  const [session, model, source, savedFonts, dir] = saved;
  for (const entry of Array.isArray(savedFonts) ? savedFonts : []) {
    try {
      addFont(entry);
    } catch {
      // A font that no longer parses is dropped; stamps keep their own outlines.
    }
  }
  refreshFontList();
  if (dir && canPickDir) exportDir = dir;
  renderDir();
  // A model opened while the cache was being read wins over the saved scene.
  if (session && typeof session === 'object' && !diceMesh) {
    try {
      const geometry = model ? unpackGeometry(model) : null;
      const original = geometry && source ? unpackGeometry(source) : null;
      applyScene(session, geometry, original);
      if (geometry) setStatus('status.restored', { name: sourceName, n: stamps.length });
    } catch {
      setStatus('status.cacheBroken');
    }
  }
  cacheOpen = true;
}

function sameArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function saveProject() {
  if (!diceMesh || busy) return;
  const toDir = await exportDirReady();
  const model = packGeometry(diceMesh.geometry);
  const source = sourceGeometry ? packGeometry(sourceGeometry) : null;
  const sourceIsModel = !source || (sameArray(source.positions, model.positions) && sameArray(source.index, model.index));
  const project = {
    app: PROJECT_APP,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    session: sessionData(),
    model: encodeGeometry(model),
    source: sourceIsModel ? null : encodeGeometry(source),
    fonts: customFonts().map((entry) => ({
      id: entry.id,
      name: entry.name,
      origin: entry.origin,
      url: entry.url,
      files: entry.buffers.map(toBase64),
    })),
  };
  const name = `${safeFileName(sourceName)}${PROJECT_EXT}`;
  const where = await saveFile(name, new Blob([JSON.stringify(project)], { type: 'application/json' }), toDir);
  setStatus('status.projectSaved', { file: name, where, n: stamps.length, fonts: project.fonts.length });
}

async function openProject(text) {
  try {
    await enginePromise;
  } catch {
    return;
  }
  let skipped = 0;
  let badFonts = 0;
  try {
    let project;
    try {
      project = JSON.parse(text);
    } catch {
      throw new AppError('err.projectParse');
    }
    if (!project || project.app !== PROJECT_APP || !project.session || typeof project.session !== 'object') {
      throw new AppError('err.projectForeign');
    }
    if (Number(project.version) > PROJECT_VERSION) throw new AppError('err.projectNewer');
    // Everything is decoded before the current scene is touched, so a bad file changes nothing.
    const geometry = project.model ? unpackGeometry(decodeGeometry(project.model)) : null;
    const source = geometry && project.source ? unpackGeometry(decodeGeometry(project.source)) : null;
    for (const entry of Array.isArray(project.fonts) ? project.fonts : []) {
      try {
        addFont({
          id: entry.id,
          name: entry.name,
          origin: entry.origin,
          url: typeof entry.url === 'string' ? entry.url : '',
          buffers: entry.files.map(fromBase64),
        });
      } catch {
        badFonts += 1;
      }
    }
    refreshFontList();
    skipped = applyScene(project.session, geometry, source);
  } catch (error) {
    setStatus(errorMsg(error, 'err.projectBroken'));
    return;
  }
  saveModel();
  saveSource();
  saveFonts();
  saveSession();
  if (skipped || badFonts) setStatus('status.projectPartly', { name: sourceName, stamps: skipped, fonts: badFonts });
  else setStatus('status.projectOpened', { name: sourceName, n: stamps.length });
}

function newProject() {
  if (!diceMesh || busy) return;
  if (!window.confirm(t('project.newConfirm'))) return;
  clearStamps();
  clearHistory();
  removeModel();
  sourceName = 'dice';
  renderInfo();
  syncButtons();
  setHint('hint.start');
  setStatus('status.cleared');
  saveModel();
  saveSource();
  saveSession();
}

// ---- Export folder ----

function renderDir() {
  ui.dir.disabled = !canPickDir;
  ui.dirClear.hidden = !exportDir;
  if (!canPickDir) ui.dirName.textContent = t('export.dirUnsupported');
  else if (exportDir) ui.dirName.textContent = t('export.dirNow', { name: exportDir.name });
  else ui.dirName.textContent = t('export.dirNone');
}

async function pickDir() {
  if (!canPickDir) return;
  let handle;
  try {
    handle = await window.showDirectoryPicker({ id: 'dice-stamp-export', mode: 'readwrite' });
  } catch (error) {
    // AbortError is the user closing the dialog.
    if (!error || error.name !== 'AbortError') setStatus('status.dirFailed');
    return;
  }
  exportDir = handle;
  renderDir();
  setStatus('status.dirSet', { name: handle.name });
  if (cacheOpen) store('dir', handle);
}

function clearDir() {
  exportDir = null;
  renderDir();
  setStatus('status.dirCleared');
  cacheDel('dir').catch(() => {});
}

// ---- Language and theme ----

function applyTheme(name) {
  const theme = THEMES.includes(name) ? name : 'midnight';
  document.documentElement.dataset.theme = theme;
  ui.theme.value = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the theme lasts for this visit.
  }
  scene.background = new THREE.Color(cssVar('--scene', '#2a241c'));
  roller.refresh();
  if (symbols.phase === 'ready') renderSymbols();
}

function renderPresets() {
  ui.presets.replaceChildren();
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t(preset.key);
    button.addEventListener('click', () => useSvg(preset.svg, t(preset.key)));
    ui.presets.append(button);
  }
}

function redrawTexts() {
  ui.status.textContent = render(live.status);
  ui.hint.textContent = render(live.hint);
  ui.engine.textContent = render(live.engine);
  ui.busy.querySelector('span').textContent = render(live.busy);
  renderPresets();
  renderInfo();
  renderList();
  renderDir();
  roller.refresh();
}

function openRoll() {
  if (!diceMesh || busy) return;
  let geometry = diceMesh.geometry;
  let temporary = null;
  if (stamps.length && solidReady && engineReady) {
    try {
      temporary = applyStamps(diceMesh.geometry, stampJobs());
      geometry = temporary;
    } catch {
      // The tray then shows the die without the signs that are not applied yet.
    }
  }
  roller.open({
    geometry,
    color: ui.color.value,
    flat: !ui.smooth.checked,
    marks: marks.concat(stamps.map(markOf)),
  });
  if (temporary) temporary.dispose();
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

// ---- Wiring ----

function firstFile(input) {
  const file = input.files && input.files[0];
  // Clearing the value lets the same file be picked again.
  input.value = '';
  return file || null;
}

function openFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.stl')) {
    file.arrayBuffer().then((buffer) => loadArrayBuffer(buffer, file.name));
  } else if (name.endsWith('.svg')) {
    file.text().then((text) => useSvg(text, file.name.replace(/\.svg$/i, '')));
  } else if (name.endsWith('.json')) {
    file.text().then(openProject);
  } else if (/\.(ttf|otf|woff|woff2)$/.test(name)) {
    addFontFile(file);
  } else {
    setStatus('err.fileKind');
  }
}

for (const input of [ui.fileStl, ui.fileSvg, ui.fileProject, ui.fileFont]) {
  input.addEventListener('change', () => {
    const file = firstFile(input);
    if (file) openFile(file);
  });
}

ui.sample.addEventListener('click', async () => {
  let response;
  try {
    response = await fetch('./samples/cube.stl');
  } catch {
    response = null;
  }
  if (!response || !response.ok) {
    setStatus('err.sampleMissing');
    return;
  }
  loadArrayBuffer(await response.arrayBuffer(), 'cube.stl');
});

ui.color.addEventListener('input', () => {
  if (diceMesh) diceMesh.material.color.set(ui.color.value);
  touch();
});

ui.smooth.addEventListener('change', () => {
  touch();
  if (!diceMesh) return;
  diceMesh.material.flatShading = !ui.smooth.checked;
  diceMesh.material.needsUpdate = true;
});

ui.flip.addEventListener('click', () => {
  if (diceMesh) adoptGeometry(flipWinding(diceMesh.geometry), sourceName, false, false);
});

ui.fit.addEventListener('click', fitCamera);
ui.tabText.addEventListener('click', () => setPane('text'));
ui.tabSvg.addEventListener('click', () => setPane('svg'));
ui.tabSymbols.addEventListener('click', () => setPane('symbols'));
ui.modeCut.addEventListener('click', () => setMode('cut'));
ui.modeRaise.addEventListener('click', () => setMode('raise'));
ui.deselect.addEventListener('click', deselect);
ui.text.addEventListener('input', scheduleSourceEdit);
ui.svg.addEventListener('input', () => {
  // Hand-edited markup is no longer the icon or file it came from.
  if (!formLock) svgLabel = '';
  scheduleSourceEdit();
});
ui.font.addEventListener('change', scheduleSourceEdit);
ui.fontRemove.addEventListener('click', dropFont);
ui.fontLoad.addEventListener('click', addFontLink);
ui.fontUrl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addFontLink();
  }
});
ui.symLib.addEventListener('change', () => {
  touch();
  loadSymbols();
});
ui.symQuery.addEventListener('input', scheduleSymbolSearch);
ui.apply.addEventListener('click', bake);
ui.undo.addEventListener('click', undo);
ui.reset.addEventListener('click', resetSource);
ui.auto.addEventListener('change', touch);
ui.dir.addEventListener('click', pickDir);
ui.dirClear.addEventListener('click', clearDir);
ui.download.addEventListener('click', exportStl);
ui.saveProject.addEventListener('click', saveProject);
ui.newProject.addEventListener('click', newProject);
ui.roll.addEventListener('click', openRoll);
ui.theme.addEventListener('change', () => applyTheme(ui.theme.value));
ui.lang.addEventListener('change', () => setLang(ui.lang.value));
controls.addEventListener('end', touch);

bindPair(ui.height, ui.heightNum, onGeomInput);
bindPair(ui.depth, ui.depthNum, onGeomInput);
bindPair(ui.rotation, ui.rotationNum, onGeomInput);
ui.offU.addEventListener('input', onGeomInput);
ui.offV.addEventListener('input', onGeomInput);

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
  if (event && diceMesh) dragTo(done.stamp, event.clientX + done.dx, event.clientY + done.dy);
  if (done.stamp.id === selectedId) {
    formLock = true;
    ui.offU.value = '0';
    ui.offV.value = '0';
    formLock = false;
  }
  setStatus('status.dragged');
  touch();
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
    setStatus('status.missedModel');
    return;
  }
  if (!solidReady) {
    // A stamp could never be applied to an open mesh, so it is not placed at all.
    setStatus('model.notSolid');
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
  if (roller.isOpen()) {
    if (event.key === 'Escape') roller.close();
    return;
  }
  if (event.key === 'Escape') {
    deselect();
    return;
  }
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
  if (!roller.isOpen()) ui.drop.hidden = false;
});
window.addEventListener('dragleave', (event) => {
  if (event.target === document.documentElement) ui.drop.hidden = true;
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  ui.drop.hidden = true;
  if (roller.isOpen()) return;
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) openFile(file);
});

// A reload right after an edit must not lose it to the save delay.
window.addEventListener('pagehide', () => {
  if (saveTimer) saveSession();
});

for (const [code, name] of LANGS) {
  const option = document.createElement('option');
  option.value = code;
  option.textContent = name;
  ui.lang.append(option);
}
ui.lang.value = getLang();

for (const lib of LIBRARIES) {
  const option = document.createElement('option');
  option.value = lib.id;
  option.textContent = lib.type === 'emoji' ? `Emoji · ${lib.name}` : lib.name;
  ui.symLib.append(option);
}

applyI18n();
applyTheme(document.documentElement.dataset.theme);
redrawTexts();
renderSymbols();

onLangChange(() => {
  redrawTexts();
  // Emoji names are per language; icon names stay English.
  if (library(ui.symLib.value).type === 'emoji' && symbols.phase !== 'idle') loadSymbols();
  else renderSymbols();
});

new ResizeObserver(resize).observe(ui.stage);
resize();
animate();

if (location.protocol === 'file:') {
  setEngine('engine.fromDisk');
  setStatus('status.fromDisk');
}

const enginePromise = initManifold()
  .then(() => {
    engineReady = true;
    setEngine(fontReady ? 'engine.readyFont' : 'engine.ready');
    syncButtons();
  })
  .catch((error) => {
    setEngine('engine.failed');
    setStatus('status.engineFailed');
    throw error;
  });

const fontPromise = loadBuiltinFont()
  .then(() => {
    fontReady = true;
    refreshFontList();
    if (engineReady) setEngine('engine.readyFont');
  })
  .catch(() => {
    setStatus('status.fontFailed');
  });

// Warmed up in the background so the first emoji does not wait for a download.
ensureEmoji().catch(() => {});

Promise.allSettled([enginePromise, fontPromise]).then(restoreCache);
