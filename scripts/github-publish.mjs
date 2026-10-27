// Uses an existing Git Credential Manager login in memory. Never logs credentials.
import { spawnSync } from 'node:child_process';
const run=(args,input)=>spawnSync('git',args,{input,encoding:'utf8',windowsHide:true});
const filled=run(['credential','fill'],'protocol=https\nhost=github.com\n\n');
if(filled.status!==0)throw new Error('GitHub authentication is unavailable. Sign in through Git Credential Manager.');
const credential=Object.fromEntries(filled.stdout.trim().split(/\r?\n/).map(line=>{const pos=line.indexOf('=');return [line.slice(0,pos),line.slice(pos+1)];}));
const headers={Accept:'application/vnd.github+json',Authorization:`Bearer ${credential.password}`,'User-Agent':'SAMADHAN-Setup','X-GitHub-Api-Version':'2022-11-28'};
const request=async(path,options={})=>{const response=await fetch(`https://api.github.com${path}`,{...options,headers:{...headers,...options.headers}});return {response,data:await response.json()};};
const identity=await request('/user');
if(!identity.response.ok)throw new Error(`GitHub authentication failed (${identity.response.status}).`);
const owner=identity.data.login;
const repo=await request(`/repos/${owner}/SAMADHAN`);
if(process.argv.includes('--audit')){console.log(JSON.stringify({authenticated:true,owner,repository_exists:repo.response.ok,repository_url:repo.response.ok?repo.data.html_url:null}));process.exit(0);}
let repository;
if(repo.response.status===404){const created=await request('/user/repos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'SAMADHAN',description:'Independent synthetic complaint lifecycle and grievance intelligence prototype',private:true,auto_init:false})});if(!created.response.ok)throw new Error(`Repository creation failed (${created.response.status}): ${created.data.message}`);repository=created.data;}
else if(repo.response.ok){repository=repo.data;const commits=await request(`/repos/${owner}/SAMADHAN/commits?per_page=1`);if(commits.response.ok&&commits.data.length){const existing=run(['remote','get-url','origin']);if(existing.status!==0||!existing.stdout.includes(`/${owner}/SAMADHAN`))throw new Error('Existing SAMADHAN repository has history. Reconcile explicitly before pushing.');}}
else throw new Error(`Repository lookup failed (${repo.response.status}).`);
const remote=run(['remote','get-url','origin']);
if(remote.status!==0){const added=run(['remote','add','origin',repository.clone_url]);if(added.status!==0)throw new Error('Cannot configure Git remote.');}
else if(remote.stdout.trim()!==repository.clone_url)throw new Error('Existing Git origin differs from the verified repository.');
const push=run(['push','-u','origin','main']);
if(push.status!==0)throw new Error(`Git push failed. ${push.stderr.replace(/https:\/\/[^\s@]+@/g,'https://[redacted]@')}`);
console.log(JSON.stringify({pushed:true,repository_url:repository.html_url,visibility:repository.private?'private':'public'}));
