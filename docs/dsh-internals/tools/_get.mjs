import fs from 'node:fs';
const asar = fs.readFileSync('D:/ProgramFiles/DSH/resources/app.asar');
const headerSize = asar.subarray(0,16).readUInt32LE(4);
const jsonLen = asar.subarray(0,16).readUInt32LE(12);
const header = JSON.parse(asar.subarray(16,16+jsonLen).toString('utf8'));
const dataOffset = 8 + headerSize;
function get(path){ const parts=path.split('/'); let n=header; for(const p of parts) n=n.files[p];
  const off=dataOffset+Number(n.offset), size=Number(n.size); return asar.subarray(off,off+size).toString('utf8'); }
fs.writeFileSync(process.argv[3], get(process.argv[2]));
console.log('ok');
