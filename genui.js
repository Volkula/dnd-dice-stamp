// The dice generator dialog: shape, face counts, size, and a live preview.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t } from './i18n.js?v=10';
import {
  SHAPES,
  GROUPS,
  CAPS,
  MIN_OUTCOMES,
  MAX_OUTCOMES,
  shapeById,
  optionsFor,
  planDie,
  buildDie,
  fitHeight,
} from './dicegen.js?v=10';

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

export function createGenerator({ engine, onAdd, onApply }) {
  const $ = (id) => document.getElementById(id);
  const ui = {
    root: $('gen'),
    title: $('gen-title'),
    close: $('gen-close'),
    stage: $('gen-stage'),
    shape: $('gen-shape'),
    counts: $('gen-counts'),
    countsLabel: $('gen-counts-label'),
    size: $('gen-size'),
    sizeNum: $('gen-size-num'),
    stretchRow: $('gen-stretch-row'),
    stretch: $('gen-stretch'),
    stretchOut: $('gen-stretch-out'),
    capsRow: $('gen-caps-row'),
    caps: $('gen-caps'),
    options: $('gen-options'),
    double: $('gen-double'),
    number: $('gen-number'),
    info: $('gen-info'),
    note: $('gen-note'),
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
  // What each shape's own settings were last set to, by shape id.
  let optionValues = {};
  // The rows of the shape on screen: { option, row, input, out }.
  let optionRows = [];
  // Set while the dialog changes a die that is already on the scene: { name }.
  let editing = null;
  let formBefore = null;

  function sizeValue() {
    const value = Number(ui.sizeNum.value);
    return Number.isFinite(value) && value > 0 ? Math.min(500, Math.max(2, value)) : 20;
  }

  function shapeOptions() {
    return optionsFor(ui.shape.value, optionValues[ui.shape.value]);
  }

  function specFor(outcomes) {
    return {
      shape: ui.shape.value,
      outcomes,
      double: ui.double.checked,
      size: sizeValue(),
      stretch: Number(ui.stretch.value) || 1,
      caps: ui.caps.value,
      options: shapeOptions(),
    };
  }

  function formState() {
    return {
      shape: ui.shape.value,
      counts: ui.counts.value,
      size: sizeValue(),
      stretch: Number(ui.stretch.value) || 1,
      caps: ui.caps.value,
      double: ui.double.checked,
      number: ui.number.checked,
      options: JSON.parse(JSON.stringify(optionValues)),
    };
  }

  function applyState(saved) {
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
    if (saved.options && typeof saved.options === 'object') {
      optionValues = {};
      for (const shape of SHAPES) {
        if (shape.options && saved.options[shape.id]) optionValues[shape.id] = optionsFor(shape.id, saved.options[shape.id]);
      }
    }
    buildOptionRows();
  }

  // A die being changed on the scene must not overwrite what the next new die starts from.
  function saveSettings() {
    if (editing) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(formState()));
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
    applyState(saved);
  }

  function optionRow(option, value) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    let input;
    let out = null;
    if (option.type === 'choice') {
      row.className = 'field';
      input = document.createElement('select');
      for (const entry of option.values) {
        const item = document.createElement('option');
        item.value = entry.id;
        input.append(item);
      }
      input.value = value;
      row.append(name, input);
    } else if (option.type === 'check') {
      row.className = 'check';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value;
      row.append(input, ' ', name);
    } else {
      row.className = 'slider';
      const head = document.createElement('span');
      out = document.createElement('output');
      head.append(name, ': ', out);
      input = document.createElement('input');
      input.type = 'range';
      input.min = String(option.min);
      input.max = String(option.max);
      input.step = String(option.type === 'count' ? 1 : option.step);
      input.value = String(value);
      row.append(head, input);
    }
    input.id = `gen-opt-${option.id}`;
    input.addEventListener(option.type === 'range' || option.type === 'count' ? 'input' : 'change', () => {
      const values = optionValues[ui.shape.value] || (optionValues[ui.shape.value] = {});
      values[option.id] = option.type === 'check' ? input.checked : option.type === 'choice' ? input.value : Number(input.value);
      onEdit();
    });
    return { option, row, name, input, out };
  }

  // The rows for the settings only the chosen shape has.
  function buildOptionRows() {
    const values = shapeOptions();
    optionRows = (shapeById(ui.shape.value).options || []).map((option) => optionRow(option, values[option.id]));
    ui.options.replaceChildren(...optionRows.map((entry) => entry.row));
    nameOptions();
  }

  function nameOptions() {
    for (const { option, name, input } of optionRows) {
      name.textContent = t(option.labelKey);
      if (option.type === 'choice') {
        option.values.forEach((entry, i) => {
          input.options[i].textContent = t(entry.key);
        });
      }
    }
  }

  // Shows what each slider stands at and hides the rows that do not apply now.
  function showOptions() {
    const values = shapeOptions();
    const plan = counts.length ? planDie(ui.shape.value, counts[0], ui.double.checked, values) : null;
    for (const { option, row, out } of optionRows) {
      row.hidden = Boolean(option.when) && Object.entries(option.when).some(([id, value]) => values[id] !== value);
      if (!out) continue;
      if (option.shows === 'split') out.textContent = plan && plan.split ? `${plan.split[0]} + ${plan.split[1]}` : '';
      else if (option.type === 'count') out.textContent = String(values[option.id]);
      else out.textContent = `×${values[option.id].toFixed(2)}`;
    }
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
    if (state === 'counts' && editing) return t('gen.err.single', { min: MIN_OUTCOMES, max: MAX_OUTCOMES });
    if (state === 'counts') return t('gen.err.counts', { min: MIN_OUTCOMES, max: MAX_OUTCOMES, most: MAX_BATCH });
    if (state === 'wait') return t('gen.wait');
    if (state === 'failed') return t('gen.err.build');
    const shape = shapeById(ui.shape.value);
    const plan = planDie(shape.id, counts[0], ui.double.checked, shapeOptions());
    const lines = [];
    if (counts.length > 1) lines.push(t('gen.info.batch', { n: counts.length, first: counts[0] }));
    if (plan.faces === 2) lines.push(t('gen.info.coin'));
    else if (plan.repeat > 1) {
      lines.push(t(plan.forced ? 'gen.info.forced' : 'gen.info.repeat', { n: plan.outcomes, faces: plan.faces, repeat: plan.repeat }));
    } else lines.push(t('gen.info.faces', { faces: plan.faces }));
    if (plan.faces > 2) {
      if (shape.kind === 'roll') lines.push(t('gen.info.roll'));
      if (shape.kind === 'ends') lines.push(t('gen.info.ends'));
      if (plan.split) lines.push(t('gen.info.split', { a: plan.split[0], b: plan.split[1] }));
      else if (shape.lopsided) lines.push(t('gen.info.lopsided'));
      else lines.push(t(plan.top ? 'gen.info.top' : 'gen.info.bottom'));
    }
    if (shape.awkward) lines.push(t('gen.info.awkward'));
    else if (shape.themed) lines.push(t('gen.info.themed'));
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
    let parsed = parseCounts(ui.counts.value);
    // One die is being changed, so one count is all that fits.
    if (editing && parsed && parsed.length > 1) parsed = null;
    counts = parsed || [];
    state = parsed ? (state === 'counts' ? 'ok' : state) : 'counts';
    showOptions();
    showInfo();
    clearTimeout(timer);
    timer = setTimeout(preview, 120);
  }

  function tick() {
    frame = requestAnimationFrame(tick);
    view.controls.update();
    view.renderer.render(view.scene, view.camera);
  }

  function showMode() {
    ui.title.textContent = t(editing ? 'gen.titleEdit' : 'gen.title');
    ui.add.textContent = t(editing ? 'gen.apply' : 'gen.add');
    ui.countsLabel.textContent = t(editing ? 'gen.countsEdit' : 'gen.counts');
    ui.note.hidden = !editing;
    ui.note.textContent = editing ? t('gen.editNote', { name: editing.name }) : '';
  }

  // edit: { spec, number, name } opens the dialog on a die that is already on the scene.
  function open(edit = null) {
    if (opened) return;
    if (!view) buildView();
    opened = true;
    editing = null;
    if (edit) {
      formBefore = formState();
      const { spec } = edit;
      applyState({
        shape: spec.shape,
        counts: String(spec.outcomes),
        size: spec.size,
        stretch: spec.stretch,
        caps: spec.caps,
        double: Boolean(spec.double),
        number: Boolean(edit.number),
        options: { ...optionValues, [spec.shape]: spec.options },
      });
      editing = { name: edit.name };
      view.moved = false;
    }
    showMode();
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
    if (editing) {
      // The form goes back to what the next new die was going to be.
      editing = null;
      applyState(formBefore);
      formBefore = null;
    }
  }

  function add() {
    if (state !== 'ok' || !counts.length) return;
    saveSettings();
    const specs = counts.map(specFor);
    const number = ui.number.checked;
    const apply = Boolean(editing);
    close();
    if (apply) onApply(specs[0], number);
    else onAdd(specs, number);
  }

  const groups = GROUPS.map((group) => {
    const element = document.createElement('optgroup');
    for (const shape of SHAPES) {
      if (shape.group !== group.id) continue;
      const option = document.createElement('option');
      option.value = shape.id;
      element.append(option);
    }
    ui.shape.append(element);
    return { element, nameKey: group.nameKey };
  });

  function nameShapes() {
    for (const group of groups) group.element.label = t(group.nameKey);
    for (const option of ui.shape.options) option.textContent = t(shapeById(option.value).nameKey);
  }

  const onEdit = () => {
    saveSettings();
    refresh();
  };

  nameShapes();
  loadSettings();

  ui.size.addEventListener('input', () => {
    ui.sizeNum.value = ui.size.value;
    onEdit();
  });
  ui.sizeNum.addEventListener('input', () => {
    ui.size.value = String(sizeValue());
    onEdit();
  });
  ui.shape.addEventListener('change', () => {
    buildOptionRows();
    onEdit();
  });
  for (const input of [ui.caps, ui.double, ui.number]) input.addEventListener('change', onEdit);
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
      nameOptions();
      if (view) view.scene.background = sceneColor();
      if (opened) {
        showMode();
        showInfo();
      }
    },
  };
}
