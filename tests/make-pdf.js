// Writes tiny test PDFs: a trail brochure with printed GPS labels (page 1 = map, page 2 = coordinate list) and a plain page.
const fs = require('fs');
function pdf(pages){
  const objs = [], add = s => (objs.push(s), objs.length);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pagesId = objs.length + 1 + pages.length * 2; // ids of page objects are allocated below, Pages object last
  const kids = [];
  for (const ops of pages){
    const c = add(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return out;
}
const text = (x, y, s, size = 12) => `BT /F1 ${size} Tf ${x} ${y} Td (${s}) Tj ET`;
// Page points map linearly to lat/lon: lon = -122.50 + (x-100)*0.0005, lat = 37.60 + (y-100)*0.0005
const geo = (x, y) => [(37.60 + (y - 100) * 0.0005).toFixed(4), (-122.50 + (x - 100) * 0.0005).toFixed(4)];
const labels = [['Alder', 100, 700], ['Birch', 500, 700], ['Cedar', 100, 100]];
const mapPage = labels.map(([n, x, y]) => text(x, y, n)).join('\n') + '\n' + text(250, 400, 'TRAIL MAP', 20);
const listPage = [text(72, 720, 'GPS Coordinates'), ...labels.map(([n, x, y], i) => text(72, 690 - i * 20, `${n}: ${geo(x, y).join(', ')}`))].join('\n');
// A park map with a light-blue lake, for Auto-align. Smaller scale: lon = -121.72 + (x-100)*0.00005, lat = 37.60 + (y-100)*0.00005
const lakeGeo = (x, y) => [37.60 + (y - 100) * 0.00005, -121.72 + (x - 100) * 0.00005];
const LAKE = [[150,300],[220,260],[300,280],[360,240],[450,270],[480,340],[430,400],[460,470],[400,520],[320,500],[260,540],[190,500],[170,430],[120,380]];
const lakeLabels = [['Alder', 100, 700], ['Birch', 500, 700], ['Cedar', 100, 100]];
const lakePage = '0.831 0.937 0.988 rg ' + LAKE.map(([x, y], i) => `${x} ${y} ${i ? 'l' : 'm'}`).join(' ') + ' h f 0 0 0 rg\n'
  + text(270, 390, 'Lake Test', 14) + '\n' + lakeLabels.map(([n, x, y]) => text(x, y, n)).join('\n');
const lakeList = [text(72, 720, 'GPS Coordinates'), ...lakeLabels.map(([n, x, y], i) => text(72, 690 - i * 20, `${n}: ${lakeGeo(x, y).map(v => v.toFixed(6)).join(', ')}`))].join('\n');
module.exports = dir => {
  fs.writeFileSync(dir + '/lake.pdf', pdf([lakePage, lakeList]));
  fs.writeFileSync(dir + '/brochure.pdf', pdf([mapPage, listPage]));
  fs.writeFileSync(dir + '/plain.pdf', pdf([text(200, 400, 'Just a picture', 24)]));
};
module.exports.LAKE = LAKE; module.exports.lakeGeo = lakeGeo;
if (require.main === module) module.exports(process.argv[2] || '.');
