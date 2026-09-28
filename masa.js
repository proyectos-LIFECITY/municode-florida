// Masa potencial 3D: setbacks por orientación, pisos, número de edificios y
// distancia entre ellos. Trabaja en pies (x = este, z = sur).

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const M_A_FT = 3.28084;
const SF_ACRE = 43560;
const ANCHO_MIN = 20;   // ft: un edificio más angosto que esto no se dibuja

const E = { lote: null, frenteIdx: 0, lados: [], edificios: [], metricas: null };
let THREE, OrbitControls, ren, esc3d, cam, ctrl, gLote, gMasa, listo = false;
let alCambiar = () => {};

/* ====================== geometría ====================== */
const areaFirmada = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j].x * p[i].z - p[i].x * p[j].z; return a / 2; };
const areaAbs = (p) => Math.abs(areaFirmada(p));

/** Anillo [lon, lat] del catastro → puntos en pies alrededor del centroide. */
export function anilloAPies(anillo) {
  const n = anillo.length;
  const lon0 = anillo.reduce((s, c) => s + c[0], 0) / n;
  const lat0 = anillo.reduce((s, c) => s + c[1], 0) / n;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180) * M_A_FT, kz = 110540 * M_A_FT;
  let pts = anillo.map(([lon, lat]) => ({ x: (lon - lon0) * kx, z: -(lat - lat0) * kz }));
  const a = pts[0], b = pts[pts.length - 1];
  if (Math.hypot(a.x - b.x, a.z - b.z) < 0.01) pts.pop();
  pts = simplificar(pts, 0.75);
  // recentra sobre el centro de la caja para que la cámara quede bien puesta
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  return pts.map((p) => ({ x: p.x - cx, z: p.z - cz }));
}

/** Douglas-Peucker sobre un anillo cerrado: el catastro trae cientos de vértices. */
function simplificar(pts, tol) {
  if (pts.length <= 4) return pts;
  // parte el anillo en los dos puntos más alejados entre sí
  let ia = 0, ib = 0, dmax = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].z - pts[0].z);
    if (d > dmax) { dmax = d; ib = i; }
  }
  const dp = (arr) => {
    if (arr.length < 3) return arr;
    const a = arr[0], b = arr[arr.length - 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    let im = 0, dm = 0;
    for (let i = 1; i < arr.length - 1; i++) {
      const d = Math.abs((b.x - a.x) * (a.z - arr[i].z) - (a.x - arr[i].x) * (b.z - a.z)) / L;
      if (d > dm) { dm = d; im = i; }
    }
    if (dm <= tol) return [a, b];
    return dp(arr.slice(0, im + 1)).slice(0, -1).concat(dp(arr.slice(im)));
  };
  const t1 = dp(pts.slice(ia, ib + 1));
  const t2 = dp(pts.slice(ib).concat([pts[0]]));
  const out = t1.slice(0, -1).concat(t2.slice(0, -1));
  return out.length >= 3 ? out : pts;
}

/** Desplaza cada lado hacia adentro su propia distancia e intersecta los lados vecinos. */
function retirarPorLado(pts, dists) {
  const n = pts.length;
  const orient = Math.sign(areaFirmada(pts)) || 1;
  const a0 = areaAbs(pts);
  if (dists.every((d) => d === 0)) return { base: pts.slice(), factor: 1 };

  const construir = (s, ds) => {
    const rectas = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      let dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = dz * s * orient, nz = -dx * s * orient;
      rectas.push({ px: a.x + nx * ds[i], pz: a.z + nz * ds[i], dx, dz });
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = rectas[(i - 1 + n) % n], q = rectas[i];
      const det = p.dx * q.dz - p.dz * q.dx;
      if (Math.abs(det) < 1e-9) { out.push({ x: q.px, z: q.pz }); continue; }
      const t = ((q.px - p.px) * q.dz - (q.pz - p.pz) * q.dx) / det;
      out.push({ x: p.px + p.dx * t, z: p.pz + p.dz * t });
    }
    return out;
  };
  const valido = (r) => r && r.every((q) => Number.isFinite(q.x) && Number.isFinite(q.z))
    && areaAbs(r) > a0 * .02 && areaAbs(r) < a0 * .9999
    && Math.sign(areaFirmada(r)) === orient;

  // Si el retiro se come el lote, se reduce proporcionalmente hasta que quepa.
  for (let k = 1; k > .05; k -= .1) {
    const ds = dists.map((d) => d * k);
    for (const s of [1, -1]) { const r = construir(s, ds); if (valido(r)) return { base: r, factor: k }; }
  }
  return { base: pts.slice(), factor: 0 };
}

function normalLado(pts, i) {
  const n = pts.length, a = pts[i], b = pts[(i + 1) % n];
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  const o = Math.sign(areaFirmada(pts)) || 1;
  return { x: dz / L * o, z: -dx / L * o };
}
const largoLado = (pts, i) => {
  const a = pts[i], b = pts[(i + 1) % pts.length];
  return Math.hypot(b.x - a.x, b.z - a.z);
};

/** Lados "de verdad": agrupados por orientación, el más largo de cada grupo. */
function ladosPrincipales(pts) {
  const orden = pts.map((_, i) => i).sort((a, b) => largoLado(pts, b) - largoLado(pts, a));
  const out = [];
  for (const i of orden) {
    if (largoLado(pts, i) < 6) break;
    const ni = normalLado(pts, i);
    if (out.every((j) => { const nj = normalLado(pts, j); return ni.x * nj.x + ni.z * nj.z < 0.87; })) out.push(i);
    if (out.length >= 8) break;
  }
  return out.length ? out : [0];
}

/** Frente / lateral / posterior según la orientación de cada lado respecto al frente. */
function distanciasPorLado(pts, frente, p) {
  const nf = normalLado(pts, frente);
  return pts.map((_, i) => {
    const ni = normalLado(pts, i);
    const cos = ni.x * nf.x + ni.z * nf.z;
    if (cos > 0.5) return p.frente;
    if (cos < -0.5) return p.posterior;
    return p.lateral;
  });
}

/** Recorta el polígono con el semiplano signo·(p·eje − t) ≥ 0 (Sutherland-Hodgman). */
function recortar(poly, eje, t, signo) {
  const out = [];
  const d = (p) => signo * (p.x * eje.x + p.z * eje.z - t);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = d(a), db = d(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const k = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
    }
  }
  return out;
}

/** Parte el área edificable en n huellas separadas `sep` pies a lo largo de `eje`. */
function dividir(base, eje, n, sep) {
  const ts = base.map((p) => p.x * eje.x + p.z * eje.z);
  const t0 = Math.min(...ts), t1 = Math.max(...ts), L = t1 - t0;
  let nEf = n;
  while (nEf > 1 && (L - (nEf - 1) * sep) / nEf < ANCHO_MIN) nEf--;
  if (nEf === 1) return { huellas: [base], ancho: L, n: 1 };
  const w = (L - (nEf - 1) * sep) / nEf;
  const huellas = [];
  for (let i = 0; i < nEf; i++) {
    const a = t0 + i * (w + sep);
    const h = recortar(recortar(base, eje, a, 1), eje, a + w, -1);
    if (h.length >= 3 && areaAbs(h) > 1) huellas.push(h);
  }
  return { huellas, ancho: w, n: nEf };
}

/* ====================== escena ====================== */
async function montar() {
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  const canvas = $('canvas3d');
  ren = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  ren.setPixelRatio(Math.min(devicePixelRatio, 2));
  ren.setClearColor(0x070c12, 1);
  ren.outputColorSpace = THREE.SRGBColorSpace;
  esc3d = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(45, 1, 2, 30000);
  ctrl = new OrbitControls(cam, canvas);
  ctrl.enableDamping = true; ctrl.maxPolarAngle = Math.PI * .495;
  esc3d.add(new THREE.AmbientLight(0x5a6e88, .85));
  const sol = new THREE.DirectionalLight(0xffe6bd, 1.15); sol.position.set(300, 560, 230); esc3d.add(sol);
  const relleno = new THREE.DirectionalLight(0x5f87ff, .35); relleno.position.set(-360, 260, -400); esc3d.add(relleno);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000),
    new THREE.MeshStandardMaterial({ color: 0x0c1219, roughness: .96 }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.y = -.5; esc3d.add(suelo);
  esc3d.add(new THREE.GridHelper(4000, 80, 0x1d2b3a, 0x141e29));   // cuadrícula de 50 ft
  gLote = new THREE.Group(); esc3d.add(gLote);
  gMasa = new THREE.Group(); esc3d.add(gMasa);
  new ResizeObserver(redimensionar).observe(canvas.parentElement);
  redimensionar();
  const animar = () => { requestAnimationFrame(animar); ctrl.update(); ren.render(esc3d, cam); };
  animar();
  listo = true;
}
function redimensionar() {
  if (!ren) return;
  const c = $('canvas3d').parentElement, w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
}
function forma2D(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0].x, -pts[0].z);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, -pts[i].z);
  return s;
}
function linea(pts, y, color, opacidad = 1, cerrar = true) {
  const r = pts.map((q) => new THREE.Vector3(q.x, y, q.z));
  if (cerrar) r.push(r[0].clone());
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(r),
    new THREE.LineBasicMaterial({ color, transparent: opacidad < 1, opacity: opacidad }));
}
function vaciar(g) {
  for (const o of [...g.children]) { o.geometry?.dispose(); o.material?.dispose(); g.remove(o); }
}

/* ====================== parámetros ====================== */
const num = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) && v > 0 ? v : null; };
function leerParams() {
  return {
    pisos: +$('sPisos').value, alturaPiso: +$('sFh').value,
    frente: +$('sAnte').value, lateral: +$('sLat').value, posterior: +$('sPost').value,
    edificios: +$('sNum').value, separacion: +$('sSep').value, eje: $('selEje').value,
    farMax: num('inFar'), alturaMax: num('inAlt'), ocupacionMax: num('inCob'), densidad: num('inDen'),
  };
}
function sincronizar() {
  for (const [s, v] of [['sPisos', 'vPisos'], ['sFh', 'vFh'], ['sAnte', 'vAnte'], ['sLat', 'vLat'],
    ['sPost', 'vPost'], ['sNum', 'vNum'], ['sSep', 'vSep']]) $(v).textContent = $(s).value;
  $('sSep').disabled = +$('sNum').value === 1;
}

/* ====================== reconstrucción ====================== */
function reconstruir() {
  sincronizar();
  if (!listo || !E.lote) return;
  const pts = E.lote.pts, p = leerParams();
  vaciar(gLote); vaciar(gMasa);
  const avisos = [];

  // Lote
  gLote.add(linea(pts, .2, 0x3aa0ff));
  const gl = new THREE.ShapeGeometry(forma2D(pts)); gl.rotateX(-Math.PI / 2);
  gLote.add(new THREE.Mesh(gl, new THREE.MeshStandardMaterial(
    { color: 0x2b4a63, transparent: true, opacity: .45, side: THREE.DoubleSide, roughness: .95 })));

  // Frente elegido: todos los lados con la misma orientación
  E.lados = ladosPrincipales(pts);
  if (E.lote.frentePref != null && E.lados.includes(E.lote.frentePref)) {
    E.lados = [E.lote.frentePref, ...E.lados.filter((i) => i !== E.lote.frentePref)];
  }
  const frente = E.lados[E.frenteIdx % E.lados.length];
  const nf = normalLado(pts, frente);
  for (let i = 0; i < pts.length; i++) {
    const ni = normalLado(pts, i);
    if (ni.x * nf.x + ni.z * nf.z <= 0.5) continue;
    gLote.add(linea([pts[i], pts[(i + 1) % pts.length]], 1, 0xf4b942, 1, false));
  }

  // Área edificable y huellas
  const { base, factor } = retirarPorLado(pts, distanciasPorLado(pts, frente, p));
  if (factor < 1) avisos.push(factor === 0
    ? 'Los setbacks no caben en el lote: se muestra el lote completo.'
    : `Los setbacks no caben completos: se aplicaron al ${Math.round(factor * 100)} %.`);
  gLote.add(linea(base, .6, 0x8fe8c0, .5));

  const a = pts[frente], b = pts[(frente + 1) % pts.length];
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const alFrente = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
  const eje = p.eje === 'frente' ? alFrente : { x: nf.x, z: nf.z };
  const div = dividir(base, eje, p.edificios, p.separacion);
  if (div.n < p.edificios) avisos.push(`Solo caben ${div.n} edificio(s) con ${p.separacion} ft de separación (ancho mínimo ${ANCHO_MIN} ft).`);

  const h = p.pisos * p.alturaPiso;
  const matMasa = new THREE.MeshStandardMaterial({ color: 0x2f9e6e, transparent: true, opacity: .74, roughness: .55, metalness: .1 });
  E.edificios = div.huellas.map((hu, i) => {
    const geo = new THREE.ExtrudeGeometry(forma2D(hu), { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    gMasa.add(new THREE.Mesh(geo, matMasa.clone()));
    gMasa.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x8fe8c0, transparent: true, opacity: .6 })));
    for (let k = 1; k < p.pisos; k++) gMasa.add(linea(hu, k * p.alturaPiso, 0x2f9e6e, .25));
    const huella = areaAbs(hu);
    const ts = hu.map((q) => q.x * eje.x + q.z * eje.z);
    const us = hu.map((q) => -q.x * eje.z + q.z * eje.x);
    return {
      n: i + 1, huella, construida: huella * p.pisos,
      ancho: Math.max(...ts) - Math.min(...ts), fondo: Math.max(...us) - Math.min(...us),
      poligono: hu.map((q) => [+q.x.toFixed(2), +(-q.z).toFixed(2)]),
    };
  });

  // Métricas
  const area = E.lote.area;
  const huella = E.edificios.reduce((s, e) => s + e.huella, 0);
  const construida = huella * p.pisos;
  E.metricas = {
    areaLote: area, edificable: areaAbs(base), huella, construida, altura: h,
    far: construida / area, ocupacion: huella / area,
    unidadesMax: p.densidad ? Math.floor(p.densidad * area / SF_ACRE) : null,
    separacionReal: div.n > 1 ? p.separacion : null,
  };
  $('masaAviso').textContent = avisos.join(' ');
  pintarMetricas(p);
  alCambiar(exportar());
}

function pintarMetricas(p) {
  const m = E.metricas;
  const est = (valor, max) => (max == null ? '' : valor <= max * 1.0001 ? 'ok' : 'mal');
  const lim = (max, txt) => (max == null ? '' : ` <small>máx. ${txt}</small>`);
  const celdas = [
    ['Área del lote', `${fmt(m.areaLote)} sf`, '', `<small>${fmt(m.areaLote / SF_ACRE, 2)} acres</small>`],
    ['Área edificable', `${fmt(m.edificable)} sf`, '', ''],
    ['Huella total', `${fmt(m.huella)} sf`, '', ''],
    ['Ocupación', `${fmt(m.ocupacion * 100, 1)} %`, est(m.ocupacion * 100, p.ocupacionMax), lim(p.ocupacionMax, `${p.ocupacionMax} %`)],
    ['Área construida', `${fmt(m.construida)} sf`, '', `<small>${fmt(m.construida / 10.7639)} m²</small>`],
    ['FAR logrado', fmt(m.far, 2), est(m.far, p.farMax), lim(p.farMax, p.farMax)],
    ['Altura', `${fmt(m.altura, 1)} ft`, est(m.altura, p.alturaMax), lim(p.alturaMax, `${p.alturaMax} ft`) || `<small>${fmt(m.altura / M_A_FT, 1)} m</small>`],
    ['Edificios', `${E.edificios.length}`, '', m.separacionReal != null ? `<small>a ${m.separacionReal} ft entre sí</small>` : ''],
  ];
  if (m.unidadesMax != null) celdas.push(['Unidades máx.', fmt(m.unidadesMax), '', `<small>${p.densidad} un/acre</small>`]);
  $('metricas').innerHTML = celdas.map(([k, v, c, extra]) =>
    `<div class="${c}"><small>${k}</small><b>${v}</b>${extra}</div>`).join('');

  $('tablaEd').innerHTML = `<table><tr><th>Edificio</th><th>Ancho</th><th>Fondo</th><th>Huella</th><th>Pisos</th><th>Construida</th></tr>${
    E.edificios.map((e) => `<tr><td>Edificio ${e.n}</td><td>${fmt(e.ancho)} ft</td><td>${fmt(e.fondo)} ft</td><td>${fmt(e.huella)} sf</td><td>${p.pisos}</td><td>${fmt(e.construida)} sf</td></tr>`).join('')
  }</table>`;
}

/** Baja (o sube) los pisos hasta el máximo que permiten FAR y altura. */
function ajustarALimites() {
  const p = leerParams(), m = E.metricas;
  if (!m) return null;
  if (p.farMax == null && p.alturaMax == null) return 'Escribe el FAR máximo o la altura máxima del código.';
  let pisos = 60;
  if (p.farMax != null && m.huella > 0) pisos = Math.min(pisos, Math.floor(p.farMax * m.areaLote / m.huella));
  if (p.alturaMax != null) pisos = Math.min(pisos, Math.floor(p.alturaMax / p.alturaPiso));
  pisos = Math.max(1, pisos);
  $('sPisos').value = pisos;
  reconstruir();
  return `Pisos ajustados a ${pisos}.`;
}

function vistaIso() {
  if (!E.lote || !cam) return;
  const r = Math.max(140, E.lote.radio * 2.4, (E.metricas?.altura || 0) * 1.6);
  cam.position.set(r, r * .85, r); ctrl.target.set(0, (E.metricas?.altura || 30) / 2.5, 0);
}
function vistaPlanta() {
  if (!E.lote || !cam) return;
  const r = Math.max(200, E.lote.radio * 3);
  cam.position.set(0, r, .01); ctrl.target.set(0, 0, 0);
}

function exportar() {
  const poligono = E.lote.pts.map((q) => [+q.x.toFixed(2), +(-q.z).toFixed(2)]);
  return { unidades: 'ft', lote: { ...E.lote.meta, area_sf: E.lote.area, poligono }, parametros: leerParams(),
    resultado: E.metricas, edificios: E.edificios };
}
function descargar(nombre, href) {
  const a = document.createElement('a'); a.href = href; a.download = nombre; a.click();
}

/* ====================== API ====================== */
export const Masa = {
  /** pts en pies; meta = datos del lote para el export. */
  async setLote(pts, meta = {}, frentePref = null) {
    if (areaFirmada(pts) === 0 || pts.length < 3) return;
    E.lote = { pts, meta, frentePref, area: areaAbs(pts), radio: Math.max(...pts.map((q) => Math.hypot(q.x, q.z))) };
    E.frenteIdx = 0;
    if (!listo) await montar();
    redimensionar();
    reconstruir();
    vistaIso();
  },
  setLoteRectangular(frente, fondo) {
    const x = frente / 2, z = fondo / 2;
    // el lado sur (z positivo) queda de primero: es el frente por defecto
    return this.setLote([{ x: -x, z }, { x, z }, { x, z: -z }, { x: -x, z: -z }],
      { origen: 'rectangular', frente_ft: frente, fondo_ft: fondo }, 0);
  },
  tieneLote: () => !!E.lote,
  exportar: () => (E.lote ? exportar() : null),
  mostrar() { if (listo) { redimensionar(); } },
  iniciar({ toast, onCambio }) {
    if (onCambio) alCambiar = onCambio;
    ['sPisos', 'sFh', 'sAnte', 'sLat', 'sPost', 'sNum', 'sSep', 'selEje', 'inFar', 'inAlt', 'inCob', 'inDen']
      .forEach((id) => $(id).addEventListener('input', reconstruir));
    sincronizar();
    $('btnFrente').onclick = () => {
      if (!E.lote) return;
      E.frenteIdx = (E.frenteIdx + 1) % E.lados.length;
      reconstruir();
      toast(`Frente del lote: lado ${E.frenteIdx + 1} de ${E.lados.length}`);
    };
    $('btnRect').onclick = () => {
      const f = +$('inFrente').value, d = +$('inFondo').value;
      if (!(f >= 20 && d >= 20)) return toast('Frente y fondo deben ser de al menos 20 ft.', true);
      $('masaLote').textContent = `Lote rectangular de ${fmt(f)} × ${fmt(d)} ft.`;
      this.setLoteRectangular(f, d);
    };
    $('btnAjustar').onclick = () => { const r = ajustarALimites(); if (r) toast(r); };
    $('btnIso').onclick = vistaIso;
    $('btnTop').onclick = vistaPlanta;
    $('btnPng').onclick = () => { if (listo) { ren.render(esc3d, cam); descargar('masa.png', $('canvas3d').toDataURL('image/png')); } };
    $('btnJson').onclick = () => {
      if (!E.lote) return;
      descargar('masa.json', URL.createObjectURL(new Blob([JSON.stringify(exportar(), null, 1)], { type: 'application/json' })));
    };
  },
};
