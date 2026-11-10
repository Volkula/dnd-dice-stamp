// The dice generator dialog: shape, face counts, size, and a live preview.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t } from './i18n.js?v=6';
import {
  SHAPES,
  CAPS,
  MIN_OUTCOMES,
  MAX_OUTCOMES,
  shapeById,
  planDie,
  buildDie,
  fitHeight,
} from './dicegen.js?v=6';

const SETTINGS_KEY = 'dice.gen';
const MAX_BATCH = 12;
const DIE_COLOR = '#d7c4a3';
const INK = '#3a2a1c';

// "3, 5, 7 23" -> [3, 5, 7, 23]. Returns null when anything in the field is not a usable count.
export function parseCounts(text) {
  const parts = String(text).split(/[\s,;]+/).filter(Boolean);
  if (!parts.length || parts.length > MAX_BATCH) return null;
  const out = [];
  for (const part of parts) {
    const digits = /^[dDдД]?(\d{1,3})$/.exec(part);
    if (!digits) return null;
    const n = Number(digits[1]);
    if (n < MIN_OUTCOMES || n > MAX_OUTCOMES) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export function createGenerator({ engine, onAdd }) {
  const $ = (id) => document.getElementById(id);
  const ui = {
    root: $('gen'),
    close: $('gen-close'),
    stage: $('gen-stage'),
    shape: $('gen-shape'),
    counts: $('gen-counts'),
    size: $('gen-size'),
    sizeNum: $('gen-size-num'),
    stretchRow: $('gen-stretch-row'),
    stretch: $('gen-stretch'),
    stretchOut: $('gen-stretch-out'),
    capsRow: $('gen-caps-row'),
    caps: $('gen-caps'),
    double: $('gen-double'),
    number: $('gen-number'),
    info: $('gen-info'),
    add: $('gen-add'),
  };

  let view = null;
  let opened = false;
  let frame = 0;
  let timer = 0;
  let counts = [];
  // 'ok' | 'wait' | 'counts' | 'failed'
  let state = 'ok';
  const textures = new Map();

  function sizeValue() {
    const value = Number(ui.sizeNum.value);
    return Number.isFinite(value) && value > 0 ? Math.min(500, Math.max(2, value)) : 20;
  }

  function specFor(outcomes) {
    return {
      shape: ui.shape.value,
      outcomes,
      double: ui.double.checked,
      size: sizeValue(),
      stretch: Number(ui.stretch.value) || 1,
      caps: ui.caps.value,
    };
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        shape: ui.shape.value,
        counts: ui.counts.value,
        size: sizeValue(),
        stretch: Number(ui.stretch.value) || 1,
        caps: ui.caps.value,
        double: ui.double.checked,
        number: ui.number.checked,
      }));
    } catch {
      // The settings then last for this visit only.
    }
  }

  function loadSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    } catch {
      saved = {};
    }
    if (SHAPES.some((shape) => shape.id === saved.shape)) ui.shape.value = saved.shape;
    if (typeof saved.counts === 'string' && parseCounts(saved.counts)) ui.counts.value = saved.counts;
    if (Number.isFinite(saved.size) && saved.size > 0) {
      ui.size.value = String(saved.size);
      ui.sizeNum.value = String(saved.size);
    }
    if (Number.isFinite(saved.stretch)) ui.stretch.value = String(saved.stretch);
    if (CAPS.includes(saved.caps)) ui.caps.value = saved.caps;
    if (typeof saved.double === 'boolean') ui.double.checked = saved.double;
    if (typeof saved.number === 'boolean') ui.number.checked = saved.number;
  }

  function sceneColor() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim();
    return new THREE.Color(value || '#2a241c');
  }

  function buildView() {
    const scene = new THREE.Scene();
    scene.background = sceneColor();
    scene.add(new THREE.HemisphereLight(0xfff4e4, 0x3a3026, 1));
    const sun = new THREE.DirectionalLight(0xfff8ee, 1.5);
    sun.position.set(40, -70, 90);
    scene.add(sun);
    const back = new THREE.DirectionalLight(0xc5d4e4, 0.5);
    back.position.set(-60, 50, -20);
    scene.add(back);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    ui.stage.prepend(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      view.moved = true;
    });

    const holder = new THREE.Group();
    scene.add(holder);
    const material = new THREE.MeshStandardMaterial({ color: DIE_COLOR, roughness: 0.5, metalness: 0.04, flatShading: true });

    const resize = () => {
      const width = ui.stage.clientWidth;
      const height = ui.stage.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    view = { scene, camera, renderer, controls, holder, material, resize, moved: false, radius: 0 };
    new ResizeObserver(resize).observe(ui.stage);
  }

  function labelTexture(label) {
    let entry = textures.get(label);
    if (entry) return entry;
    const canvas = document.createElement('canvas');
    const height = 96;
    const probe = canvas.getContext('2d');
    probe.font = `700 ${height * 0.8}px Georgia, serif`;
    const width = Math.max(height * 0.5, Math.ceil(probe.measureText(label).width) + 8);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.font = `700 ${height * 0.8}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.fillText(label, width / 2, height * 0.54);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    entry = { texture, aspect: width / height };
    textures.set(label, entry);
    return entry;
  }

  function clearDie() {
    for (const child of [...view.holder.children]) {
      view.holder.remove(child);
      child.geometry.dispose();
      if (child.material !== view.material) child.material.dispose();
    }
  }

  function showDie(die, size) {
    clearDie();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(die.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(die.index, 1));
    geometry.computeVertexNormals();
    view.holder.add(new THREE.Mesh(geometry, view.material));

    if (ui.number.checked) {
      for (const face of die.faces) {
        const { texture, aspect } = labelTexture(face.label);
        const height = fitHeight(face, aspect) * 0.72;
        if (!(height > 0)) continue;
        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(height * aspect, height),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
        );
        const normal = new THREE.Vector3().fromArray(face.normal);
        const up = new THREE.Vector3().fromArray(face.up);
        const right = new THREE.Vector3().crossVectors(up, normal);
        plate.matrixAutoUpdate = false;
        plate.matrix.makeBasis(right, up, normal).setPosition(
          new THREE.Vector3().fromArray(face.center).addScaledVector(normal, size * 0.002),
        );
        view.holder.add(plate);
      }
    }

    // A new size or shape re-frames the die; turning it by hand is kept otherwise.
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere.radius;
    if (!view.moved || Math.abs(radius - view.radius) > radius * 0.02) {
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(view.camera.fov / 2)) * 1.15;
      const direction = view.moved
        ? view.camera.position.clone().sub(view.controls.target).normalize()
        : new THREE.Vector3(0.62, -0.68, 0.4).normalize();
      view.controls.target.set(0, 0, 0);
      view.camera.position.copy(direction.multiplyScalar(distance));
      view.camera.near = radius / 50;
      view.camera.far = radius * 60;
      view.camera.updateProjectionMatrix();
    }
    view.radius = radius;
  }

  function describe() {
    if (state === 'counts') return t('gen.err.counts', { min: MIN_OUTCOMES, max: MAX_OUTCOMES, most: MAX_BATCH });
    if (state === 'wait') return t('gen.wait');
    if (state === 'failed') return t('gen.err.build');
    const shape = shapeById(ui.shape.value);
    const plan = planDie(shape.id, counts[0], ui.double.checked);
    const lines = [];
    if (counts.length > 1) lines.push(t('gen.info.batch', { n: counts.length, first: counts[0] }));
    if (plan.faces === 2) lines.push(t('gen.info.coin'));
    else if (plan.repeat > 1) {
      lines.push(t(plan.forced ? 'gen.info.forced' : 'gen.info.repeat', { n: plan.outcomes, faces: plan.faces, repeat: plan.repeat }));
    } else lines.push(t('gen.info.faces', { faces: plan.faces }));
    if (plan.faces > 2) {
      if (shape.kind === 'roll') lines.push(t('gen.info.roll'));
      if (shape.kind === 'ends') lines.push(t('gen.info.ends'));
      lines.push(t(plan.top ? 'gen.info.top' : 'gen.info.bottom'));
    }
    if (shape.themed) lines.push(t('gen.info.themed'));
    return lines.join(' ');
  }

  function showInfo() {
    ui.info.textContent = describe();
    ui.add.disabled = state !== 'ok';
  }

  function preview() {
    timer = 0;
    if (!opened || state === 'counts') return;
    const api = engine();
    if (!api) {
      state = 'wait';
      showInfo();
      // The engine is still downloading: look again shortly.
      timer = setTimeout(preview, 400);
      return;
    }
    try {
      const spec = specFor(counts[0]);
      showDie(buildDie(api, spec), spec.size);
      state = 'ok';
    } catch {
      clearDie();
      state = 'failed';
    }
    showInfo();
  }

  function refresh() {
    const shape = shapeById(ui.shape.value);
    ui.stretchRow.hidden = !shape.stretch;
    ui.capsRow.hidden = !shape.caps;
    ui.stretchOut.textContent = `×${Number(ui.stretch.value).toFixed(2)}`;
    const parsed = parseCounts(ui.counts.value);
    counts = parsed || [];
    state = parsed ? (state === 'counts' ? 'ok' : state) : 'counts';
    showInfo();
    clearTimeout(timer);
    timer = setTimeout(preview, 120);
  }

  function tick() {
    frame = requestAnimationFrame(tick);
    view.controls.update();
    view.renderer.render(view.scene, view.camera);
  }

  function open() {
    if (opened) return;
    if (!view) buildView();
    opened = true;
    ui.root.hidden = false;
    view.scene.background = sceneColor();
    view.resize();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
    state = 'ok';
    refresh();
    ui.counts.focus();
  }

  function close() {
    if (!opened) return;
    opened = false;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    ui.root.hidden = true;
  }

  function add() {
    if (state !== 'ok' || !counts.length) return;
    saveSettings();
    const specs = counts.map(specFor);
    const number = ui.number.checked;
    close();
    onAdd(specs, number);
  }

  for (const shape of SHAPES) {
    const option = document.createElement('option');
    option.value = shape.id;
    ui.shape.append(option);
  }

  function nameShapes() {
    for (const option of ui.shape.options) option.textContent = t(shapeById(option.value).nameKey);
  }

  nameShapes();
  loadSettings();

  const onEdit = () => {
    saveSettings();
    refresh();
  };
  ui.size.addEventListener('input', () => {
    ui.sizeNum.value = ui.size.value;
    onEdit();
  });
  ui.sizeNum.addEventListener('input', () => {
    ui.size.value = String(sizeValue());
    onEdit();
  });
  for (const input of [ui.shape, ui.caps, ui.double, ui.number]) input.addEventListener('change', onEdit);
  for (const input of [ui.counts, ui.stretch]) input.addEventListener('input', onEdit);
  ui.counts.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  });
  ui.add.addEventListener('click', add);
  ui.close.addEventListener('click', close);
  ui.root.addEventListener('pointerdown', (event) => {
    if (event.target === ui.root) close();
  });

  return {
    open,
    close,
    isOpen: () => opened,
    // Called when the language or the theme changes.
    refresh() {
      nameShapes();
      if (view) view.scene.background = sceneColor();
      if (opened) showInfo();
    },
  };
}
