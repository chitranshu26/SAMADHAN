import fs from 'node:fs';
const p='.data/demo-credentials.json';
if(!fs.existsSync(p)){console.error('Start SAMADHAN after importing the dataset to generate local demo credentials.');process.exit(1);}
console.log(fs.readFileSync(p,'utf8'));
