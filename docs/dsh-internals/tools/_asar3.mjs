import fs from 'node:fs';
const asar = fs.readFileSync('D:/ProgramFiles/DSH/resources/app.asar');
const headerSize = asar.subarray(0, 16).readUInt32LE(4);
const jsonLen = asar.subarray(0, 16).readUInt32LE(12);
const header = JSON.parse(asar.subarray(16, 16 + jsonLen).toString('utf8'));
const dataOffset = 8 + headerSize;
const kw = process.argv[2];
const hits = [];
function walk(node, path) {
  if (node.files) { for (const [n, c] of Object.entries(node.files)) walk(c, path ? path + '/' + n : n); return; }
  if (!/\.(js|mjs|cjs|tsx|jsx)$/.test(path)) return;
  const off = dataOffset + Number(node.offset), size = Number(node.size);
  const text = asar.subarray(off, off + size).toString('utf8');
  let c = 0, i = text.indexOf(kw);
  while (i !== -1) { c += 1; i = text.indexOf(kw, i + kw.length); }
  if (c) hits.push([path, size, c]);
}
walk(header, '');
hits.sort((a, b) => b[2] - a[2]);
for (const h of hits.slice(0, 25)) console.log(h[2], h[1], h[0]);
