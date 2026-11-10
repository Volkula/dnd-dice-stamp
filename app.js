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
  ui.deselect.hidden = !selectedStamp();
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
  setHint('Клик — новый штамп, Shift+клик — перенести выбранный');
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
    mesh = new THREE.Mesh(geometry, stamp.mode === 'raise' ? raiseMat : cutMat);
    mesh.raycast = () => {};
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0xf3eee6, 0.3, 0.16);
    mesh.add(arrow);
    scene.add(mesh);
    previews.set(stamp.id, mesh);
  } else {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    mesh.material = stamp.mode === 'raise' ? raiseMat : cutMat;
  }
  positionPreview(stamp);
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
  syncButtons();
}

function selectStamp(id) {
  const stamp = stamps.find((item) => item.id === id);
  if (!stamp) return;
  selectedId = id;
  formLock = true;
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
  setStatus(`Выбран штамп «${stampLabel(stamp)}». Сдвиньте его ползунками или Shift+кликом.`);
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
  let contours;
  try {
    contours = fitContours(artwork.contours, height);
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
    contours,
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
    setStatus('Штамп стоит на грани. Можно крутить его или нанести на модель.');
  }
}

function moveSelected(hit) {
  const stamp = selectedStamp();
  if (!stamp) return;
  stamp.point.copy(hit.point);
  stamp.normal.copy(hit.face.normal).transformDirection(diceMesh.matrixWorld).normalize();
  positionPreview(stamp);
  setStatus('Штамп перенесён.');
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
      stamp.contours = fitContours(stamp.sourceContours, stamp.height);
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

function hitFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(diceMesh, false);
  return hits[0] || null;
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
ui.deselect.addEventListener('click', () => {
  selectedId = null;
  renderList();
});
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
  file.text().then((text) => {
    ui.svg.value = text;
    setKind('svg');
    setStatus(`SVG «${file.name}» в поле. Кликните по грани.`);
  });
});

for (const preset of PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = preset.name;
  button.addEventListener('click', () => {
    ui.svg.value = preset.svg;
    setKind('svg');
    setStatus(`Заготовка «${preset.name}». Кликните по грани.`);
  });
  ui.presets.append(button);
}

let down = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  down = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!down || event.button !== 0 || busy || !diceMesh) return;
  const dx = event.clientX - down.x;
  const dy = event.clientY - down.y;
  down = null;
  if (dx * dx + dy * dy > 9) return;
  const hit = hitFromEvent(event);
  if (!hit || !hit.face) {
    setStatus('Клик мимо модели.');
    return;
  }
  if (event.shiftKey && selectedStamp()) moveSelected(hit);
  else placeStamp(hit);
});

window.addEventListener('keydown', (event) => {
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
    file.text().then((text) => {
      ui.svg.value = text;
      setKind('svg');
      setStatus(`SVG «${file.name}» в поле.`);
    });
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
