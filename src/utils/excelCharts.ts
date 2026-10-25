import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface ExcelChartSeries {
  name: string;
  categories: string[];
  values: (number | null)[];
  categoriesRef: string;
  valuesRef: string;
}
export interface ExcelChart {
  title: string;
  kind: 'pie' | 'bar';
  numberFormat: string;
  series: ExcelChartSeries[];
}

const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const COLOURS = ['6366F1', '14B8A6', 'F59E0B', 'F43F5E', '0EA5E9', '84CC16', 'A855F7', 'F97316', 'D946EF', '10B981', 'EAB308', '3B82F6'];
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const fill = (index: number) => `<c:spPr><a:solidFill><a:srgbClr val="${COLOURS[index % COLOURS.length]}"/></a:solidFill></c:spPr>`;

function seriesXml(series: ExcelChartSeries, index: number, chart: ExcelChart) {
  const colours = chart.kind === 'pie' || chart.series.length === 1
    ? series.values.map((_, i) => `<c:dPt><c:idx val="${i}"/>${fill(i)}</c:dPt>`).join('') : fill(index);
  return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:v>${xml(series.name)}</c:v></c:tx>${colours}
    <c:cat><c:strRef><c:f>${xml(series.categoriesRef)}</c:f><c:strCache><c:ptCount val="${series.categories.length}"/>${series.categories.map((name, i) => `<c:pt idx="${i}"><c:v>${xml(name)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>
    <c:val><c:numRef><c:f>${xml(series.valuesRef)}</c:f><c:numCache><c:formatCode>${xml(chart.numberFormat)}</c:formatCode><c:ptCount val="${series.values.length}"/>${series.values.map((value, i) => value !== null && Number.isFinite(value) ? `<c:pt idx="${i}"><c:v>${value}</c:v></c:pt>` : '').join('')}</c:numCache></c:numRef></c:val></c:ser>`;
}

function chartXml(chart: ExcelChart) {
  const series = chart.series.map((series, index) => seriesXml(series, index, chart)).join('');
  const plot = chart.kind === 'pie'
    ? `<c:pieChart><c:varyColors val="1"/>${series}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/></c:dLbls></c:pieChart>`
    : `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="${chart.series.length === 1 ? 1 : 0}"/>${series}<c:gapWidth val="150"/><c:axId val="100"/><c:axId val="200"/></c:barChart>
      <c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="200"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>
      <c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="${xml(chart.numberFormat)}" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  return `${declaration}<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${DRAWING_NS}" xmlns:r="${REL_NS}"><c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

// Native, editable DrawingML charts, with worksheet formulas AND cached data.
// Package layout follows https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/how-to-insert-a-chart-into-a-spreadsheet
// Only our generated workbook enters this function; no uploaded ZIP is processed.
export function addNativeExcelCharts(workbook: Uint8Array, sheetNumber: number, charts: ExcelChart[]): Uint8Array {
  const files = unzipSync(workbook);
  const sheetPath = `xl/worksheets/sheet${sheetNumber}.xml`;
  if (!files[sheetPath] || files[`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`] || files['xl/drawings/rofinance-charts.xml']) throw new Error('Invalid chart worksheet');
  files[sheetPath] = strToU8(strFromU8(files[sheetPath]).replace('</worksheet>', `<drawing xmlns:r="${REL_NS}" r:id="rofinanceCharts"/></worksheet>`));
  files[`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`] = strToU8(`${declaration}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rofinanceCharts" Type="${REL_NS}/drawing" Target="../drawings/rofinance-charts.xml"/></Relationships>`);
  const anchors = charts.map((chart, index) => {
    const col = 3 + (index % 2) * 11, row = 1 + Math.floor(index / 2) * 21;
    files[`xl/charts/rofinance-chart-${index + 1}.xml`] = strToU8(chartXml(chart));
    const marker = (kind: 'from' | 'to', c: number, r: number) => `<xdr:${kind}><xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${kind}>`;
    return `<xdr:twoCellAnchor>${marker('from', col, row)}${marker('to', col + 10, row + 19)}
      <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 1}" name="${xml(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${CHART_NS}"><c:chart xmlns:c="${CHART_NS}" xmlns:r="${REL_NS}" r:id="chart${index + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  }).join('');
  files['xl/drawings/rofinance-charts.xml'] = strToU8(`${declaration}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${DRAWING_NS}">${anchors}</xdr:wsDr>`);
  files['xl/drawings/_rels/rofinance-charts.xml.rels'] = strToU8(`${declaration}<Relationships xmlns="${PACKAGE_REL_NS}">${charts.map((_, i) => `<Relationship Id="chart${i + 1}" Type="${REL_NS}/chart" Target="../charts/rofinance-chart-${i + 1}.xml"/>`).join('')}</Relationships>`);
  const overrides = `<Override PartName="/xl/drawings/rofinance-charts.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    + charts.map((_, i) => `<Override PartName="/xl/charts/rofinance-chart-${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('');
  files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace('</Types>', overrides + '</Types>'));
  return zipSync(files, { level: 6 });
}
