// Páginas oficiales que complementan el código: Property Appraiser, GIS,
// zoning y planeación de cada condado, más las capas que permiten detectar el
// zoning del lote automáticamente.

export const PARCELAS =
  'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0';

const MD = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer';

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
  },
  'palm-beach': {
    centro: [26.62, -80.20], zoom: 10,
    appraiser: (id) => `https://pbcpao.gov/Property/Details?parcelId=${encodeURIComponent(id)}`,
    fuentes: [
      { t: 'Property Appraiser (PAPA)', d: 'Avalúo, dueño, ventas y área del lote', u: 'https://pbcpao.gov/' },
      { t: 'Zoning · Palm Beach County', d: 'División de zoning y ULDC', u: 'https://discover.pbcgov.org/pzb/zoning/Pages/default.aspx' },
      { t: 'Open Data GIS', d: 'Capas GIS del condado', u: 'https://opendata2-pbcgov.opendata.arcgis.com/' },
    ],
    zoning: [],
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
    fuentes: [{ t: 'Miami 21', d: 'Código de zoning por transectos de la ciudad de Miami', u: 'https://www.miami21.org/' }],
  },
};

export const GENERALES = [
  { t: 'FEMA Flood Map Service', d: 'Zona de inundación y elevación base', u: 'https://msc.fema.gov/portal/search' },
];

export function condadoPorCoNo(catalogo, coNo) {
  return Object.keys(catalogo.condados).find((k) => catalogo.condados[k].co_no === Number(coNo)) || null;
}
