import { Masa, anilloAPies } from './masa.js?v=4';
import { PARCELAS, CONDADOS, CIUDADES, GENERALES, condadoPorCoNo, ordenCondados } from './fuentes.js?v=4';

const $ = (id) => document.getElementById(id);
const API = (window.MUNI_CONFIG?.api ?? '/api/municode').replace(/\/$/, '');
const BIBLIOTECA = 'https://library.municode.com/';
const ESTADO_FL = 9;   // StateID de Florida en Municode
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const norm = (s) => String(s || '').toLowerCase().replace(/village/g, '').replace(/[^a-z]/g, '');

const TERMINOS = ['setback', 'height', 'floor area ratio', 'lot coverage', 'density', 'distance between buildings', 'parking'];

const S = {
  catalogo: null, condado: 'miami-dade', j: null,
  productos: [], producto: null, job: null,
  nodo: null, lote: null, zona: null,
};

let tToast;
function toast(msg, mal) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast on' + (mal ? ' mal' : '');
  clearTimeout(tToast); tToast = setTimeout(() => { t.className = 'toast'; }, 3400);
}

async function api(ruta, params) {
  if (!API) throw new Error('el lector del código aún no está conectado en este sitio');
  const q = params ? '?' + new URLSearchParams(params) : '';
  const r = await fetch(`${API}/${ruta}${q}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
  return r.json();
}

/** El HTML viene de Municode: se le quitan scripts, eventos y enlaces activos peligrosos. */
function limpiar(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'style' || n === 'srcset') el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src') && /^\s*(javascript|data|vbscript):/i.test(a.value)) el.removeAttribute(a.name);
    }
    for (const at of ['href', 'src']) {
      const v = el.getAttribute(at);
      if (v && !/^(https?:|mailto:|#)/i.test(v)) {
        try { el.setAttribute(at, new URL(v, BIBLIOTECA).href); } catch { el.removeAttribute(at); }
      }
    }
    if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
  });
  return doc.body.innerHTML;
}

/* ====================== pestañas ====================== */
function irATab(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + tab));
  if (tab === 'lote') { iniciarMapa(); setTimeout(() => mapa.invalidateSize(), 30); }
  if (tab === 'masa') {
    if (!Masa.tieneLote()) $('btnRect').click();
    requestAnimationFrame(() => Masa.mostrar());
  }
}
$('tabs').onclick = (e) => { if (e.target.dataset.tab) irATab(e.target.dataset.tab); };
$('btnMenu').onclick = () => $('lista').classList.toggle('abierta');

/* ====================== jurisdicciones ====================== */
function pintarLista() {
  const c = S.catalogo;
  $('condados').innerHTML = Object.entries(c.condados).map(([k, v]) =>
    `<button data-c="${k}" class="${k === S.condado ? 'on' : ''}">${esc(v.nombre)}</button>`).join('');
  const f = norm($('filtro').value);
  // con filtro se busca en los tres condados
  const items = c.jurisdicciones.filter((j) => (f ? j.clave.includes(f) : j.condado === S.condado));
  $('items').innerHTML = items.map((j) => {
    const tag = !j.municode ? 'externo' : j.tipo === 'condado' ? 'condado' : f ? c.condados[j.condado].nombre : '';
    return `<button data-k="${j.condado}/${j.clave}" class="${S.j === j ? 'on' : ''}"><span>${esc(j.nombre)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</button>`;
  }).join('') || '<p class="hint">Sin resultados.</p>';
  const n = c.jurisdicciones.filter((j) => j.condado === S.condado);
  $('pieLista').textContent = `${n.length} jurisdicciones · ${n.filter((j) => j.municode).length} en Municode`;
}
$('condados').onclick = (e) => {
  if (!e.target.dataset.c) return;
  S.condado = e.target.dataset.c; $('filtro').value = ''; pintarLista();
};
$('filtro').oninput = pintarLista;
$('items').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const [cond, clave] = b.dataset.k.split('/');
  elegir(buscarJ(cond, clave), { volar: true });
  $('lista').classList.remove('abierta');
};
const buscarJ = (cond, clave) => S.catalogo.jurisdicciones.find((j) => j.condado === cond && j.clave === clave);

async function elegir(j, { volar = false } = {}) {
  if (!j) return;
  S.j = j; S.condado = j.condado; S.nodo = null;
  try { localStorage.setItem('muni.j', `${j.condado}/${j.clave}`); } catch { /* sin almacenamiento */ }
  $('actual').textContent = `${j.nombre} · ${S.catalogo.condados[j.condado].nombre}`;
  pintarLista(); pintarFuentes(); pintarChips();
  if (volar) volarA(j);
  actualizarCapaZoning();

  $('selProducto').innerHTML = ''; $('vigencia').textContent = '';
  $('lnkBiblioteca').href = j.biblioteca || j.fuente_externa;
  $('lnkBiblioteca').textContent = j.municode ? 'Abrir en Municode ↗' : 'Abrir fuente ↗';

  if (!j.municode) {
    $('toc').innerHTML = '<p class="hint">Esta jurisdicción no publica su código en Municode.</p>';
    $('contenido').innerHTML = `<div class="bienvenida"><h1>${esc(j.nombre)}</h1>
      <p>Su código no está en Municode, así que no se puede leer aquí. ${j.fuente_verificada
        ? 'Se publica en American Legal:' : 'Búscalo en su sitio oficial:'}</p>
      <p><a class="btn" href="${esc(j.fuente_externa)}" target="_blank" rel="noopener">${j.fuente_verificada ? 'Abrir el código ↗' : 'Buscar el código ↗'}</a></p>
      <p class="hint">El lote, las fuentes del condado y la masa 3D sí funcionan para esta ciudad.</p></div>`;
    return;
  }

  $('toc').innerHTML = '<p class="hint"><span class="spin"></span>Cargando…</p>';
  try {
    const cc = await api(`ClientContent/${j.clientId}`);
    if (S.j !== j) return;
    S.productos = (cc.codes || []).filter((p) => !p.hideInLibrary);
    if (!S.productos.length) throw new Error('Municode no lista códigos para esta jurisdicción.');
    $('selProducto').innerHTML = S.productos.map((p) => `<option value="${p.productId}">${esc(p.productName)}</option>`).join('');
    await cargarProducto(S.productos[0].productId);
  } catch (e) {
    $('toc').innerHTML = `<p class="hint">No se pudo cargar: ${esc(e.message)}</p>`;
  }
}

/* ====================== código ====================== */
$('selProducto').onchange = (e) => cargarProducto(+e.target.value);

async function cargarProducto(productId) {
  const j = S.j;
  S.producto = S.productos.find((p) => p.productId === productId);
  $('selProducto').value = productId;
  $('toc').innerHTML = '<p class="hint"><span class="spin"></span>Cargando índice…</p>';
  const job = await api(`Jobs/latest/${productId}`);
  if (S.j !== j) return;
  S.job = job;
  const banner = String(job.BannerText || '').replace(/<[^>]*>/g, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const vig = banner.filter((l) => /ordinance|codified|supp|adopted|enacted|current/i.test(l)).join(' ');
  $('vigencia').textContent = [vig, job.Name].filter(Boolean).join(' · ');

  const toc = await api('codesToc', { jobId: job.Id, productId });
  if (S.j !== j) return;
  $('toc').innerHTML = '';
  $('toc').appendChild(listaNodos(toc.Children || []));
  $('contenido').innerHTML = `<div class="bienvenida"><h1>${esc(j.nombre)}</h1>
    <p>${esc(S.producto.productName)} — elige una sección del índice o busca un término.</p>
    <p class="hint">Para el estudio de masa busca el distrito de zoning del lote y sus <i>setbacks</i>, <i>height</i>, <i>FAR</i> y <i>lot coverage</i>.</p></div>`;
}

function listaNodos(nodos) {
  const ul = document.createElement('ul');
  for (const n of nodos) {
    const li = document.createElement('li');
    li.innerHTML = `<div class="n"><button class="fl">${n.HasChildren ? '▸' : ''}</button><button class="tt"></button></div>`;
    const [fl, tt] = li.querySelectorAll('button');
    tt.textContent = n.Heading; tt.dataset.id = n.Id;
    tt.onclick = () => { abrirNodo(n.Id); if (n.HasChildren && !li.dataset.abierto) fl.click(); };
    if (n.HasChildren) fl.onclick = async () => {
      if (li.dataset.abierto) {
        const sub = li.querySelector('ul');
        sub.hidden = !sub.hidden; fl.textContent = sub.hidden ? '▸' : '▾';
        return;
      }
      li.dataset.abierto = '1'; fl.textContent = '…';
      try {
        const hijos = await api('codesToc/children', { jobId: S.job.Id, nodeId: n.Id, productId: S.producto.productId });
        li.appendChild(listaNodos(hijos));
        fl.textContent = '▾';
      } catch (e) { delete li.dataset.abierto; fl.textContent = '▸'; toast(e.message, true); }
    };
    ul.appendChild(li);
  }
  return ul;
}

async function abrirNodo(nodeId, productId) {
  if (productId && productId !== S.producto?.productId && S.productos.some((p) => p.productId === productId)) {
    await cargarProducto(productId);
  }
  S.nodo = nodeId;
  document.querySelectorAll('.toc .tt').forEach((b) => b.classList.toggle('on', b.dataset.id === nodeId));
  const c = $('contenido');
  c.innerHTML = '<p class="hint"><span class="spin"></span>Cargando texto…</p>';
  try {
    const d = await api('CodesContent', { jobId: S.job.Id, nodeId, productId: S.producto.productId });
    if (S.nodo !== nodeId) return;
    const docs = (d.Docs || []).filter((x) => x.Content || x.Id === nodeId);
    const url = `${S.j.biblioteca}/codes/${S.producto.productName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}?nodeId=${encodeURIComponent(nodeId)}`;
    c.innerHTML = docs.map((x) => `<article data-id="${esc(x.Id)}" class="${x.Id === nodeId ? 'foco' : ''}">
        <h3>${esc(x.Title)}</h3>${limpiar(x.Content)}${x.Footnotes ? limpiar(x.Footnotes) : ''}</article>`).join('')
      + `<div class="navdoc">
          ${d.PrevNode ? `<button class="btn sec" data-ir="${esc(d.PrevNode.Id)}">← ${esc(recortar(d.PrevNode.Heading))}</button>` : '<span></span>'}
          <a class="btn sec" href="${esc(url)}" target="_blank" rel="noopener">Ver en Municode ↗</a>
          ${d.NextNode ? `<button class="btn sec" data-ir="${esc(d.NextNode.Id)}">${esc(recortar(d.NextNode.Heading))} →</button>` : '<span></span>'}
        </div>`;
    const foco = c.querySelector('article.foco');
    if (foco && foco !== c.firstElementChild) foco.scrollIntoView({ block: 'start' }); else c.scrollTop = 0;
  } catch (e) {
    c.innerHTML = `<p class="hint">No se pudo cargar el texto: ${esc(e.message)}</p>`;
  }
}
const recortar = (s, n = 38) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

$('contenido').onclick = (e) => {
  const ir = e.target.closest('[data-ir]');
  if (ir) return abrirNodo(ir.dataset.ir);
  const hit = e.target.closest('.resultado');
  if (hit) abrirNodo(hit.dataset.nodo, +hit.dataset.producto);
};

$('fBuscar').onsubmit = (e) => { e.preventDefault(); buscarEnCodigo($('qBuscar').value); };

async function buscarEnCodigo(texto, pagina = 1) {
  texto = String(texto || '').trim();
  if (!texto) return;
  if (!S.j?.municode) return toast('Elige una jurisdicción con código en Municode.', true);
  $('qBuscar').value = texto;
  irATab('codigo');
  S.nodo = null;
  const c = $('contenido');
  c.innerHTML = '<p class="hint"><span class="spin"></span>Buscando…</p>';
  try {
    const r = await api('search', {
      clientId: S.j.clientId, contentTypeId: 'CODES', fragmentSize: 220, isAdvanced: false, isAutocomplete: false,
      mode: 'CURRENT', pageNum: pagina, pageSize: 25, searchText: texto, sort: 0, stateId: ESTADO_FL, titlesOnly: false,
    });
    const hits = r.Hits || [];
    c.innerHTML = `<p class="hint">${fmt(r.NumberOfHits || 0)} resultados para «${esc(texto)}» en ${esc(S.j.nombre)}</p>`
      + hits.map((h) => `<button class="resultado" data-nodo="${esc(h.NodeId)}" data-producto="${esc(h.Product?.Id)}">
          <div class="ruta">${esc((h.Ancestors || []).slice(1).map((a) => a.Title).join(' › '))}</div>
          <div class="tit">${limpiar(h.Title)}</div>
          <div class="frag">${limpiar(h.ContentFragment)}</div></button>`).join('')
      + (r.NumberOfHits > pagina * 25 ? `<button class="btn sec" id="btnMas">Más resultados</button>` : '');
    c.scrollTop = 0;
    const mas = $('btnMas'); if (mas) mas.onclick = () => buscarEnCodigo(texto, pagina + 1);
  } catch (err) {
    c.innerHTML = `<p class="hint">La búsqueda falló: ${esc(err.message)}</p>`;
  }
}

function pintarChips() {
  const zona = S.zona?.zona;
  const lista = (zona ? [zona] : []).concat(TERMINOS);
  const html = lista.map((t) => `<button data-q="${esc(t)}">${esc(t)}</button>`).join('');
  $('chips').innerHTML = html;
  $('chipsMasa').innerHTML = (zona
    ? ['setback', 'height', 'floor area ratio', 'lot coverage', 'distance between buildings'].map((t) => `${zona} ${t}`)
    : ['setback', 'height', 'floor area ratio', 'lot coverage', 'distance between buildings'])
    .map((t) => `<button data-q="${esc(t)}">${esc(t)}</button>`).join('');
}
for (const id of ['chips', 'chipsMasa']) {
  $(id).onclick = (e) => { if (e.target.dataset.q) buscarEnCodigo(e.target.dataset.q); };
}

/* ====================== mapa y lote ====================== */
let mapa, capaLote, marcador, capaZoning, leyenda;
const geojsonZoning = {};   // por ciudad: se descarga una sola vez

function iniciarMapa() {
  if (mapa) return;
  mapa = L.map('mapa', { zoomControl: true }).setView([26.2, -80.25], 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap · Parcelas: Florida Statewide Cadastral',
  }).addTo(mapa);
  mapa.on('click', (e) => ubicar(e.latlng.lat, e.latlng.lng));
  mapa.createPane('zoning').style.zIndex = 350;   // bajo el lote, sobre el mapa base
  actualizarCapaZoning();
  if (S.pendienteVolar) { const [c, z] = S.pendienteVolar; mapa.setView(c, z); S.pendienteVolar = null; }
}

/** Pinta el mapa de zonificación de la ciudad elegida, si publica uno, con su leyenda. */
async function actualizarCapaZoning() {
  if (!mapa) return;
  if (capaZoning) { capaZoning.remove(); capaZoning = null; }
  if (leyenda) { leyenda.remove(); leyenda = null; }
  const j = S.j, cfg = j && CIUDADES[j.clave]?.mapa;
  if (!cfg) return;

  const color = Object.fromEntries(cfg.clases.map(([k, c]) => [k, c]));
  leyenda = L.control({ position: 'bottomleft' });
  leyenda.onAdd = () => {
    const d = L.DomUtil.create('div', 'leyenda');
    d.innerHTML = `<label class="ley-t"><input type="checkbox" id="leyVer" checked> ${esc(cfg.titulo)}</label>
      <div id="leyCuerpo"><input type="range" id="leyOp" min="10" max="100" value="60" title="Opacidad">
      <div class="ley-items">${cfg.clases.map(([k, c, n]) =>
        `<div><i style="background:${c}"></i><b>${esc(k)}</b> ${esc(n)}</div>`).join('')}</div>
      <small id="leyEstado"><span class="spin"></span>Cargando…</small></div>`;
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
    return d;
  };
  leyenda.addTo(mapa);
  const estilo = () => ({ fillOpacity: $('leyOp').value / 100 });
  $('leyVer').onchange = (e) => {
    $('leyCuerpo').hidden = !e.target.checked;
    if (capaZoning) (e.target.checked ? capaZoning.addTo(mapa) : capaZoning.remove());
  };
  $('leyOp').oninput = () => capaZoning?.setStyle(estilo());

  try {
    geojsonZoning[j.clave] ??= await fetch(`${cfg.url}/query?` + new URLSearchParams({
      where: '1=1', outFields: cfg.campos, outSR: 4326, geometryPrecision: 6, maxAllowableOffset: 0.00001, f: 'geojson',
    })).then((r) => r.json());
    if (S.j !== j) return;
    const gj = geojsonZoning[j.clave];
    if (!gj.features?.length) throw new Error('sin datos');
    capaZoning = L.geoJSON(gj, {
      pane: 'zoning', interactive: false,
      style: (f) => ({ color: '#33414f', weight: .6, fillColor: color[f.properties[cfg.campo]] || '#cccccc', ...estilo() }),
    });
    if ($('leyVer').checked) capaZoning.addTo(mapa);
    $('leyEstado').textContent = `${fmt(gj.features.length)} zonas · ${cfg.fuente}`;
  } catch {
    delete geojsonZoning[j.clave];
    if ($('leyEstado')) $('leyEstado').textContent = 'La capa de zoning no respondió.';
  }
}

async function geocodificar(q) {
  const u = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    format: 'jsonv2', limit: 1, countrycodes: 'us', q, viewbox: '-81.0,27.1,-79.9,25.1', bounded: 1,
  });
  const r = await fetch(u).then((x) => x.json());
  return r[0] ? { lat: +r[0].lat, lon: +r[0].lon, nombre: r[0].display_name } : null;
}

async function volarA(j) {
  const cond = CONDADOS[j.condado];
  let destino = [cond.centro, cond.zoom];
  if (j.tipo === 'municipio') {
    try {
      const g = await geocodificar(`${j.nombre}, ${S.catalogo.condados[j.condado].nombre} County, Florida`);
      if (g) destino = [[g.lat, g.lon], 14];
    } catch { /* se queda en el centro del condado */ }
  }
  if (mapa) mapa.setView(...destino); else S.pendienteVolar = destino;
}

$('fDir').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('qDir').value.trim();
  if (!q) return;
  try {
    const g = await geocodificar(/florida|, *fl\b/i.test(q) ? q : `${q}, Florida`);
    if (!g) return toast('No se encontró esa dirección en el sur de la Florida.', true);
    mapa.setView([g.lat, g.lon], 18);
    ubicar(g.lat, g.lon, q);
  } catch { toast('El buscador de direcciones no respondió.', true); }
};

async function consultarCapa(url, lat, lon, { geometria = false, campos = '*', radioM = 0 } = {}) {
  const u = `${url}/query?` + new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects', outFields: campos, returnGeometry: geometria, outSR: 4326, f: 'json',
    ...(radioM ? { distance: radioM, units: 'esriSRUnit_Meter' } : {}),
  });
  const d = await fetch(u).then((r) => r.json());
  if (d.error) throw new Error(d.error.message || 'Error del servicio GIS');
  return d.features || [];
}

const areaAnillo = (r) => Math.abs(r.reduce((s, c, i) => { const p = r[(i + r.length - 1) % r.length]; return s + p[0] * c[1] - c[0] * p[1]; }, 0));

/** Busca el lote en la capa de cada condado, empezando por el que toca según la latitud. */
async function buscarParcela(lat, lon, direccion) {
  const orden = ordenCondados(lat);
  const capas = PARCELAS.filter((p) => !p.estatal)
    .sort((x, y) => orden.indexOf(x.condado) - orden.indexOf(y.condado))
    .concat(PARCELAS.filter((p) => p.estatal));
  const numero = direccion.match(/^\s*(\d+)/)?.[1];
  let fallos = 0;
  for (const radioM of direccion ? [0, 40] : [0]) {
    for (const capa of capas) {
      try {
        const fs = await consultarCapa(capa.url, lat, lon, { geometria: true, radioM });
        const lotes = fs.filter((f) => f.geometry?.rings?.length).map((f) => ({ f, d: capa.leer(f.attributes) }));
        const l = lotes.find((x) => numero && x.d.direccion?.startsWith(numero + ' ')) || lotes[0];
        if (!l) continue;
        const condado = capa.condado || condadoPorCoNo(S.catalogo, l.d.coNo);
        if (!condado) return { fuera: true };
        return { f: l.f, d: l.d, condado, fuente: capa.fuente };
      } catch { fallos++; }
    }
  }
  return { fallos, total: capas.length };
}

/** `direccion`: si viene de una búsqueda, el punto suele caer en la vía; se busca el lote vecino. */
async function ubicar(lat, lon, direccion = '') {
  if (marcador) marcador.remove();
  marcador = L.circleMarker([lat, lon], { radius: 5, color: '#f4b942' }).addTo(mapa);
  $('loteInfo').innerHTML = '<p class="hint"><span class="spin"></span>Buscando el lote…</p>';
  $('zonaInfo').innerHTML = ''; $('btnAMasa').disabled = true;
  S.lote = null; S.zona = null;

  const r = await buscarParcela(lat, lon, direccion);
  if (r.fuera) {
    $('loteInfo').innerHTML = '<p class="hint">Ese lote está fuera de Miami-Dade, Broward y Palm Beach.</p>';
    return;
  }
  if (!r.f) {
    $('loteInfo').innerHTML = r.fallos >= r.total
      ? '<p class="hint">Las capas de parcelas no respondieron. Intenta de nuevo en un momento.</p>'
      : '<p class="hint">No hay un lote en ese punto (puede ser una vía o un cuerpo de agua). Toca dentro de un predio.</p>';
    return;
  }
  const { d, condado } = r;
  const anillo = r.f.geometry.rings.reduce((m, x) => (areaAnillo(x) > areaAnillo(m) ? x : m));
  const pts = anilloAPies(anillo);
  const centro = L.polygon(anillo.map(([x, y]) => [y, x])).getBounds().getCenter();
  if (direccion) { lat = centro.lat; lon = centro.lng; }
  S.lote = { d, condado, anillo, pts, lat, lon, id: d.id };

  if (capaLote) capaLote.remove();
  capaLote = L.polygon(anillo.map(([x, y]) => [y, x]), { color: '#3aa0ff', weight: 2, fillOpacity: .25 }).addTo(mapa);
  mapa.fitBounds(capaLote.getBounds(), { maxZoom: 19, padding: [60, 60] });

  const areaMedida = Masa.areaDe(pts);
  const filas = [
    ['Dirección', [d.direccion, d.ciudad, d.zip].filter(Boolean).join(', ')], ['Parcel ID', d.id],
    ['Condado', S.catalogo.condados[condado].nombre],
    ['Área (appraiser)', d.areaSf && `${fmt(d.areaSf)} sf · ${fmt(d.areaSf / 43560, 2)} acres`],
    ['Área (medida)', `${fmt(areaMedida)} sf · ${fmt(areaMedida / 43560, 2)} acres`],
    ['Año construido', d.anio], ['Área construida', d.construidaSf && `${fmt(d.construidaSf)} sf`],
    ['Avalúo', d.valor && `$${fmt(d.valor)}`], ['Valor del suelo', d.valorSuelo && `$${fmt(d.valorSuelo)}`],
    ['Uso', d.uso], ['Propietario', d.propietario], ['Legal', d.legal],
  ].filter(([, v]) => v);
  $('loteInfo').innerHTML = `<div class="kv">${filas.map(([k, v]) => `<span>${k}</span><span>${esc(v)}</span>`).join('')}</div>
    <p class="hint">Fuente: ${esc(r.fuente)}. Lo que falte está en la ficha del Property Appraiser.</p>`;
  $('btnAMasa').disabled = false;

  await detectarZona(lat, lon, condado, d);
  pintarFuentes(); pintarChips();
}

/** Zoning por punto y, de paso, la jurisdicción a la que pertenece el lote. */
async function detectarZona(lat, lon, condado, d) {
  const enCondado = (clave) => S.catalogo.jurisdicciones.find((j) => j.condado === condado && j.clave === clave);
  const gobierno = S.catalogo.jurisdicciones.find((j) => j.condado === condado && j.tipo === 'condado');
  let j = null, origenJ = null, zona = null;

  $('zonaInfo').innerHTML = '<p class="hint"><span class="spin"></span>Consultando zoning…</p>';
  // La jurisdicción sale del límite municipal oficial; la ciudad de la ficha es el respaldo.
  const lim = CONDADOS[condado].municipios;
  try {
    const [m] = await consultarCapa(lim.url, lat, lon, { campos: lim.campo });
    if (m) {
      j = enCondado(norm(m.attributes[lim.campo])) || gobierno;
      origenJ = j === gobierno ? 'los límites municipales (área no incorporada)' : 'los límites municipales del condado';
    }
  } catch { /* se usa el respaldo */ }
  if (!j && enCondado(norm(d.ciudad))) { j = enCondado(norm(d.ciudad)); origenJ = 'la ciudad de la ficha del lote'; }
  const capas = [...(j && CIUDADES[j.clave]?.zoning || []), ...CONDADOS[condado].zoning];
  for (const capa of capas) {
    try {
      const [z] = await consultarCapa(capa.url, lat, lon);
      if (!z) continue;
      const ciudad = capa.ciudad ? String(z.attributes[capa.ciudad] || '') : '';
      if (/unincorporated/i.test(ciudad)) { j = gobierno; origenJ = 'la capa de zoning (área no incorporada)'; continue; }
      if (ciudad && enCondado(norm(ciudad))) { j = enCondado(norm(ciudad)); origenJ = 'la capa de zoning municipal'; }
      if (capa.noIncorporado) { j = gobierno; origenJ = 'la capa de zoning del condado'; }
      if (capa.confirma) origenJ = 'la capa de zoning de la ciudad';
      const cod = String(z.attributes[capa.zona] || '').replace(/\s*\(.*\)\s*$/, '').trim();   // «PUD (city)» → «PUD»
      if (cod && cod.toUpperCase() !== 'NONE') { zona = { zona: cod, desc: z.attributes[capa.desc] || '', fuente: capa.fuente }; break; }
    } catch { /* la capa no respondió: se prueba la siguiente */ }
  }
  if (!j) { j = gobierno; origenJ = null; }

  let inundacion = '';
  const fi = CONDADOS[condado].inundacion;
  if (fi) {
    try {
      const [z] = await consultarCapa(fi.url, lat, lon);
      if (z) inundacion = `<div class="kv"><span>Zona FEMA</span><span>${esc(z.attributes.FZONE)}${z.attributes.ELEV > 0 ? ` · elevación base ${esc(z.attributes.ELEV)} ft` : ''}</span></div>`;
    } catch { /* opcional */ }
  }

  S.zona = zona;
  $('zonaInfo').innerHTML = (zona
    ? `<div class="zona">${esc(zona.zona)}</div><div>${esc(zona.desc)}</div>
       <p class="hint">Fuente: ${esc(zona.fuente)}.</p>
       <button class="btn sec" id="btnZona">Buscar «${esc(zona.zona)}» en el código</button>`
    : `<p class="hint">Aquí no hay una capa pública de zoning. Identifica el distrito en el mapa de zoning de la ciudad y búscalo en el código.</p>`)
    + inundacion
    + `<p class="hint">Jurisdicción: <b>${esc(j.nombre)}</b>${origenJ ? ` (según ${origenJ})` : ''}. Si el lote está en otra, elígela en la lista.</p>`;
  const bz = $('btnZona'); if (bz) bz.onclick = () => buscarEnCodigo(zona.zona);

  if (j !== S.j) { await elegir(j); toast(`Código cargado: ${j.nombre}`); }
}

$('btnAMasa').onclick = async () => {
  if (!S.lote) return;
  const d = S.lote.d;
  $('masaLote').innerHTML = `<b>${esc(d.direccion || S.lote.id)}</b> · ${esc(S.j?.nombre || '')}${S.zona ? ` · zoning <b>${esc(S.zona.zona)}</b>` : ''}`;
  const listo = Masa.setLote(S.lote.pts, {
    origen: 'catastro', parcel_id: S.lote.id, direccion: d.direccion || null, ciudad: d.ciudad || null,
    jurisdiccion: S.j?.nombre, zoning: S.zona?.zona || null, lat: S.lote.lat, lon: S.lote.lon,
  });
  irATab('masa');
  await listo;
  Masa.mostrar();
  toast('Usa «Girar frente» para marcar el lado que da a la calle.');
};

/* ====================== fuentes ====================== */
function pintarFuentes() {
  const j = S.j, l = S.lote;
  const condado = l?.condado || j?.condado;
  if (!condado) { $('fuentes').innerHTML = '<p class="hint">Elige una jurisdicción o un lote.</p>'; return; }
  const cond = CONDADOS[condado];
  const item = (f) => `<a class="fuente" href="${esc(f.u)}" target="_blank" rel="noopener">${esc(f.t)} ↗<small>${esc(f.d)}</small></a>`;
  let h = '';

  if (l) {
    h += '<div class="grupo">Este lote</div>';
    h += item({ t: 'Ficha en el Property Appraiser', d: `Parcel ID ${l.id}`, u: cond.appraiser(l.id) });
    h += item({ t: 'Google Maps', d: 'Vista satelital y Street View', u: `https://www.google.com/maps/search/?api=1&query=${l.lat.toFixed(6)},${l.lon.toFixed(6)}` });
  }
  if (j) {
    h += `<div class="grupo">${esc(j.nombre)}</div>`;
    if (j.municode) h += item({ t: 'Biblioteca Municode', d: 'Código completo, ordenanzas y versiones anteriores', u: j.biblioteca });
    else h += item({ t: 'Código de la ciudad', d: j.fuente_verificada ? 'American Legal Publishing' : 'Búsqueda del código oficial', u: j.fuente_externa });
    if (j.web) h += item({ t: 'Sitio oficial', d: j.web.replace(/^https?:\/\//, '').replace(/\/$/, ''), u: j.web });
    for (const f of CIUDADES[j.clave]?.fuentes || []) h += item(f);
  }
  h += `<div class="grupo">Condado de ${esc(S.catalogo.condados[condado].nombre)}</div>` + cond.fuentes.map(item).join('');
  h += '<div class="grupo">General</div>' + GENERALES.map(item).join('');
  $('fuentes').innerHTML = h;
}

/* ====================== arranque ====================== */
async function iniciar() {
  Masa.iniciar({ toast });
  pintarChips();
  try {
    S.catalogo = await fetch('data/jurisdicciones.json').then((r) => r.json());
  } catch {
    $('items').innerHTML = '<p class="hint">Falta data/jurisdicciones.json. Corre <code>python -m scraper.municode_catalog</code>.</p>';
    return;
  }
  $('nTotal').textContent = S.catalogo.jurisdicciones.length;
  let previo = null;
  try { previo = localStorage.getItem('muni.j'); } catch { /* sin almacenamiento */ }
  const j = previo && buscarJ(...previo.split('/'));
  if (j) { S.condado = j.condado; elegir(j, { volar: true }); } else { pintarLista(); pintarFuentes(); }
}
iniciar();
