import fs from 'node:fs';
const asar = fs.readFileSync('D:/ProgramFiles/DSH/resources/app.asar');
const headerSize = asar.subarray(0,16).readUInt32LE(4);
const jsonLen = asar.subarray(0,16).readUInt32LE(12);
const header = JSON.parse(asar.subarray(16,16+jsonLen).toString('utf8'));
const dataOffset = 8 + headerSize;
const out=[];
function walk(node, path){ if(node.files){for(const[n,c] of Object.entries(node.files)) walk(c, path?path+'/'+n:n); return;}
 if(/sidebar-right/.test(path)) out.push([path, node.size]); }
walk(header,'');
for(const o of out) console.log(o[1], o[0]);
