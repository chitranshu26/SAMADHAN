import fs from 'node:fs';
const file='public/maps/india-states.geojson';
const geo=JSON.parse(fs.readFileSync(file,'utf8'));
const states=fs.readFileSync('.data/import/master/states.jsonl','utf8').trim().split(/\r?\n/).map(JSON.parse);
const aliases={CT:'CG',OR:'OD',UT:'UK',TG:'TS',DH:'DN'};
for(const feature of geo.features){
 const code=feature.properties.shapeISO.replace('IN-','');
 const state=states.find(s=>s.state_code===(aliases[code]||code));
 if(!state)throw new Error(`Unmatched boundary ${code}`);
 feature.properties={...feature.properties,name:state.state_name,state_name:state.state_name,state_code:state.state_code,region_id:state.region_id};
}
if(new Set(geo.features.map(f=>f.properties.state_code)).size!==36)throw new Error('Expected all 36 states/UTs');
fs.writeFileSync(file,JSON.stringify(geo));
fs.writeFileSync('public/maps/source.json',JSON.stringify({
 title:'India ADM1 boundaries, geoBoundaries IND-ADM1-1811400',
 source:'DataMeet India community, Election Commission of India, via geoBoundaries',
 source_url:'https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/',
 download_url:'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1_simplified.geojson',
 license:'Creative Commons Attribution 2.5 India (CC BY 2.5 IN)',
 license_url:'https://creativecommons.org/licenses/by/2.5/in/',
 source_commit:'9469f09',source_build_date:'2023-12-12',boundary_year_metadata:'2011',features:36,
 modifications:'Property aliases aligned to synthetic dataset state identifiers; geometry retained from source simplified file.',
 notice:'Map depicts the cited geographic source. Synthetic regional assignments are illustrative and unverified; no official jurisdiction claim.'
},null,2));
console.log('Mapped all 36 source state/UT boundaries to dataset identifiers.');
