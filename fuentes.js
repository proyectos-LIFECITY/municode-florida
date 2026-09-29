// Páginas oficiales que complementan el código: Property Appraiser, GIS,
// zoning y planeación de cada condado, más las capas que permiten detectar el
// zoning del lote automáticamente.

const BR = 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services';
const PB = 'https://maps.co.palm-beach.fl.us/arcgis/rest/services/OpenData';
const txt = (v) => (v == null ? '' : String(v).trim());

// Parcelas: la capa oficial de cada condado, llevada a un mismo esquema. Un
// condado puede tener varias capas; se prueban en orden. La última es el
// catastro estatal, que sirve de respaldo cuando está abierto.
export const PARCELAS = [
  {
    condado: 'miami-dade', fuente: 'Miami-Dade County GIS · PaParcel',
    url: 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer/72',
    leer: (a) => ({
      id: txt(a.FOLIO), direccion: txt(a.TRUE_SITE_ADDR), ciudad: txt(a.TRUE_SITE_CITY),
      zip: txt(a.TRUE_SITE_ZIP_CODE).slice(0, 5), areaSf: +a.LOT_SIZE || null, anio: +a.YEAR_BUILT || null,
      uso: txt(a.DOR_DESC), legal: txt(a.LEGAL),
    }),
  },
  {
    condado: 'broward', fuente: 'Broward County GIS · Property Appraiser',
    url: `${BR}/Parcels_FEMA_App/FeatureServer/0`,
    leer: (a) => ({
      id: txt(a.FOLIO), zip: txt(a.SITUS_ZIP_CODE), propietario: txt(a.NAME_LINE_1),
      valorSuelo: +a.LAST_YRS_JUST_LAND_VALUE || null, uso: txt(a.USE_CODE) && `Código ${txt(a.USE_CODE)}`,
    }),
  },
  {
    condado: 'broward', fuente: 'Broward County GIS · Parcel Boundaries',
    url: `${BR}/Parcels/FeatureServer/0`,
    leer: (a) => ({ id: txt(a.FOLIO) }),
  },
  {
    condado: 'palm-beach', fuente: 'Palm Beach County · Parcels and Property Details',
    url: 'https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0',
    leer: (a) => ({
      id: txt(a.PARID || a.PARCEL_NUMBER), direccion: txt(a.SITE_ADDR_STR), ciudad: txt(a.MUNICIPALITY),
      areaSf: a.ACRES ? Math.round(a.ACRES * 43560) : null, anio: +a.YRBLT || null, propietario: txt(a.OWNER_NAME1),
      valor: +a.TOTAL_MARKET || null, valorSuelo: +a.LAND_MARKET || null, uso: txt(a.PROPERTY_USE),
      legal: [a.LEGAL1, a.LEGAL2].map(txt).filter(Boolean).join(' '),
    }),
  },
  {
    estatal: true, fuente: 'Florida Statewide Cadastral',
    url: 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0',
    leer: (a) => ({
      coNo: a.CO_NO, id: txt(a.PARCEL_ID || a.PARCELNO), direccion: txt(a.PHY_ADDR1), ciudad: txt(a.PHY_CITY),
      zip: txt(a.PHY_ZIPCD), areaSf: +a.LND_SQFOOT || null, anio: +a.ACT_YR_BLT || null,
      construidaSf: +a.TOT_LVG_AR || null, propietario: txt(a.OWN_NAME), valor: +a.JV || null,
      valorSuelo: +a.LND_VAL || null, uso: txt(a.DOR_UC) && `DOR ${txt(a.DOR_UC)}`, legal: txt(a.S_LEGAL),
    }),
  },
];

/** Los condados van de sur a norte: se consulta primero el que corresponde a la latitud. */
export function ordenCondados(lat) {
  if (lat < 25.98) return ['miami-dade', 'broward', 'palm-beach'];
  if (lat < 26.34) return ['broward', 'palm-beach', 'miami-dade'];
  return ['palm-beach', 'broward', 'miami-dade'];
}

const MD = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer';
const M21 = 'https://services1.arcgis.com/CvuPhqcTQpZPT9qY/arcgis/rest/services/M21_Zoning/FeatureServer/0';

export const CONDADOS = {
  'miami-dade': {
    centro: [25.77, -80.30], zoom: 10,
    appraiser: (id) => `https://www.miamidade.gov/Apps/PA/propertysearch/#/?folio=${encodeURIComponent(id)}`,
    fuentes: [
      { t: 'Property Appraiser', d: 'Avalúo, dueño, ventas y área del lote', u: 'https://www.miamidadepa.gov/pa/home.page' },
      { t: 'Zoning · Miami-Dade County', d: 'Trámites, audiencias y mapas de zoning', u: 'https://www.miamidade.gov/zoning/' },
      { t: 'Open Data GIS', d: 'Capas de parcelas, zoning y uso del suelo', u: 'https://gis-mdc.opendata.arcgis.com/' },
    ],
    // Capas de zoning por punto: municipal primero, condado (no incorporado) después.
    zoning: [
      { url: `${MD}/17`, fuente: 'Municipal Zoning · Miami-Dade GIS', zona: 'ZONE', desc: 'ZONEDESC', ciudad: 'MUNICNAME' },
      { url: `${MD}/14`, fuente: 'County Zoning · Miami-Dade GIS', zona: 'ZONE', desc: 'ZONE_DESC', noIncorporado: true },
    ],
    inundacion: { url: `${MD}/85`, fuente: 'FEMA Flood Zones · Miami-Dade GIS' },
    municipios: { url: `${MD}/32`, campo: 'NAME' },
  },
  'broward': {
    centro: [26.14, -80.25], zoom: 10,
    appraiser: (id) => `https://bcpa.net/RecInfo.asp?URL_Folio=${encodeURIComponent(id)}`,
    fuentes: [
      { t: 'Property Appraiser (BCPA)', d: 'Avalúo, dueño, ventas y área del lote', u: 'https://bcpa.net/' },
      { t: 'Planning · Broward County', d: 'Plan de uso del suelo y planeación', u: 'https://www.broward.org/Planning' },
      { t: 'GeoHub Broward', d: 'Capas GIS del condado', u: 'https://geohub-bcgis.opendata.arcgis.com/' },
    ],
    zoning: [],
    municipios: { url: `${BR}/Cities_Multipart/FeatureServer/0`, campo: 'CITYNAME' },
  },
  'palm-beach': {
    centro: [26.62, -80.20], zoom: 10,
    appraiser: (id) => `https://pbcpao.gov/Property/Details?parcelId=${encodeURIComponent(id)}`,
    fuentes: [
      { t: 'Property Appraiser (PAPA)', d: 'Avalúo, dueño, ventas y área del lote', u: 'https://pbcpao.gov/' },
      { t: 'Zoning · Palm Beach County', d: 'División de zoning y ULDC', u: 'https://discover.pbcgov.org/pzb/zoning/Pages/default.aspx' },
      { t: 'Open Data GIS', d: 'Capas GIS del condado', u: 'https://opendata2-pbcgov.opendata.arcgis.com/' },
    ],
    zoning: [{ url: `${PB}/Planning_Open_Data/MapServer/9`, fuente: 'Zoning · Palm Beach County GIS', zona: 'FCODE', desc: 'FNAME' }],
    municipios: { url: `${PB}/Boundaries_Open_Data/MapServer/5`, campo: 'MUNINAME' },
  },
};

// Ciudades que publican su propia capa de zoning o tienen un código aparte.
export const CIUDADES = {
  delraybeach: {
    zoning: [{
      url: 'https://utility.arcgis.com/usrsvcs/servers/35d7382b2b094dffa6c97d2eb7b7556e/rest/services/EnterpriseGIS_View/GIS_View/FeatureServer/21',
      fuente: 'Zoning · City of Delray Beach GIS', zona: 'ABRV', desc: 'DISTRICT',
    }],
  },
  miami: {
    fuentes: [
      { t: 'Miami 21', d: 'Código de zoning por transectos de la ciudad de Miami', u: 'https://www.miami21.org/' },
      { t: 'Capa Miami 21 Zoning', d: 'Datos abiertos de la ciudad en ArcGIS Online', u: 'https://www.arcgis.com/home/item.html?id=064c93f16768497d8662b6d58a240703' },
    ],
    zoning: [{ url: M21, fuente: 'Miami 21 Zoning · City of Miami GIS', zona: 'M21_ZONE', desc: 'Transect_D', confirma: true }],
    // Mapa de zonificación sobre el visor. La capa pública no trae simbología:
    // los colores siguen la convención del atlas Miami 21 (de cálido claro a
    // oscuro según la intensidad del transecto), agrupados por Map_Code.
    mapa: {
      titulo: 'Zonificación · Miami 21',
      url: M21, campo: 'Map_Code', campos: 'M21_ZONE,Map_Code,Transect_D',
      fuente: 'City of Miami GIS · colores de referencia',
      clases: [
        ['T3', '#fff2a8', 'Sub-Urban'],
        ['T4', '#f9cf6b', 'General Urban'],
        ['T5', '#f4a261', 'Urban Center'],
        ['T6-8', '#ef8a80', 'Urban Core · 8 pisos'],
        ['T6-12', '#e5626a', 'Urban Core · 12 pisos'],
        ['T6-24', '#d43d51', 'Urban Core · 24 pisos'],
        ['T6-36', '#b5264f', 'Urban Core · 36 pisos'],
        ['T6-48', '#8e1b55', 'Urban Core · 48 pisos'],
        ['T6-60', '#6a1b5e', 'Urban Core · 60 pisos'],
        ['T6-80', '#45155a', 'Urban Core · 80 pisos'],
        ['D1', '#c9b3d9', 'Work Place'],
        ['D2', '#9e9e9e', 'Industrial'],
        ['D3', '#607d8b', 'Waterfront Industrial'],
        ['CI', '#4f81bd', 'Civic Institution'],
        ['CI-HD', '#8db4e2', 'Civic Institution · Health District'],
        ['CS', '#9ccc65', 'Civic Space'],
        ['T1', '#5b8c5a', 'Natural'],
      ],
    },
  },
};

export const GENERALES = [
  { t: 'FEMA Flood Map Service', d: 'Zona de inundación y elevación base', u: 'https://msc.fema.gov/portal/search' },
];

export function condadoPorCoNo(catalogo, coNo) {
  return Object.keys(catalogo.condados).find((k) => catalogo.condados[k].co_no === Number(coNo)) || null;
}
