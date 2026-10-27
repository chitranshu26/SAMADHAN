import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import type { Row } from '@/types';

export interface DB { query<T=Row>(sql:string,params?:any[]):Promise<{rows:T[]}>; exec(sql:string):Promise<any>; transaction<T>(fn:(tx:DB)=>Promise<T>):Promise<T>; close?:()=>Promise<any>; }
declare global { var __samadhanDB:Promise<DB>|undefined; }
const root=process.cwd();
export const dataRoot=path.join(root,'.data');
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}

async function connect():Promise<DB>{
 await fs.mkdir(dataRoot,{recursive:true});
 let adapter:DB;
 if(process.env.DATABASE_URL){
  const {Pool}=await import('pg'); const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DB_SSL==='false'?false:process.env.DATABASE_URL.includes('localhost')?false:{rejectUnauthorized:true}});
  adapter={close:()=>pool.end(),query:async(sql,params)=>{const c=await pool.connect();try{await c.query('SET search_path TO aicte_demo, public');return await c.query(sql,params) as any;}finally{c.release();}},exec:async(sql)=>{await adapter.query(sql);},transaction:async(fn)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET search_path TO aicte_demo, public');const tx:DB={query:async(s,p)=>await c.query(s,p) as any,exec:async(s)=>{await c.query(s);},transaction:async(f)=>f(tx)};const result=await fn(tx);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
 } else {
  const {PGlite}=await import('@electric-sql/pglite'); const pg=new PGlite(process.env.PGLITE_DATA_DIR||path.join(dataRoot,'postgres')); await pg.waitReady;
  const wrap=(client:any):DB=>({query:async(s,p)=>await client.query(s,p),exec:async(s)=>await client.exec(s),transaction:async(fn)=>await client.transaction((tx:any)=>fn(wrap(tx)))});
  adapter=wrap(pg);adapter.close=()=>pg.close();
 }
 const original=await fs.readFile(path.join(root,'database/seeds/source-schema.sql'),'utf8');
 await adapter.exec(original);
 await adapter.exec('SET search_path TO aicte_demo, public');
 await adapter.exec('CREATE TABLE IF NOT EXISTS aicte_demo.app_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT now())');
 const migrations=(await fs.readdir(path.join(root,'database/migrations'))).filter(f=>f.endsWith('.sql')).sort();
 for(const name of migrations){if(name.includes('supabase'))continue;const applied=await adapter.query('SELECT name FROM aicte_demo.app_migrations WHERE name=$1',[name]);if(!applied.rows.length)await adapter.transaction(async tx=>{await tx.exec(await fs.readFile(path.join(root,'database/migrations',name),'utf8'));await tx.query('INSERT INTO aicte_demo.app_migrations(name) VALUES($1)',[name]);});}
 return adapter;
}
export async function db(){if(!globalThis.__samadhanDB)globalThis.__samadhanDB=connect().catch(e=>{globalThis.__samadhanDB=undefined;throw e;});return globalThis.__samadhanDB;}
export const getDB=db;
export const ensureDatabase=db;
export async function query<T=Row>(sql:string,params:any[]=[]){return (await (await db()).query<T>(sql,params)).rows;}
export async function closeDatabase(){const conn=globalThis.__samadhanDB;globalThis.__samadhanDB=undefined;if(conn)await (await conn).close?.();}

export async function seedDemoUsers(){
 const conn=await db();const existing=await conn.query('SELECT id FROM app_users LIMIT 1');if(existing.rows.length)return;
 const master=await conn.query('SELECT bureau_id FROM bureaus WHERE bureau_id=$1',['PGRC']);if(!master.rows.length)return;
 const accounts:any[]=[];
 await conn.transaction(async tx=>{
  await tx.query("INSERT INTO complainants(complainant_id,person_type,preferred_language,identity_method,identity_assurance,apaar_verified,privacy_protected,consent_for_updates,source_type) VALUES('DEMO-COMPLAINANT','Student','English','Email','Demo email verification',false,true,true,'LIVE_DEMO') ON CONFLICT DO NOTHING");
  const defs=[['complainant','Aarav Sharma','Student / Complainant',null],['so','Meera Iyer','Section Officer','DEMO-SO'],['da','Rohan Desai','Dealing Assistant','DEMO-DA'],['director','Dr. Kavita Rao','Director / Bureau Head','DEMO-DIRECTOR'],['chairman','Dr. Vikram Sen','Senior Leadership',null],['admin','Priya Menon','System Administrator',null]];
  for(const [role,name,designation,officer] of defs){const email=`${role}@samadhan.demo`;const password=process.env.DEMO_PASSWORD||`Sam@${randomBytes(9).toString('base64url')}7`;const bureau=['so','da','director'].includes(role!)?'PGRC':null;
   if(officer)await tx.query('INSERT INTO officers(officer_id,pseudonym,bureau_id,region_id,role,active,on_duty_from,source_type) VALUES($1,$2,$3,NULL,$4,true,CURRENT_DATE,\'LIVE_DEMO\') ON CONFLICT DO NOTHING',[officer,name,bureau,designation]);
   await tx.query('INSERT INTO app_users(id,email,password_hash,name,role,designation,bureau_id,officer_id,complainant_id,verified,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true)',[`DEMO-${role}`,email,hashPassword(password),name,role,designation,bureau,officer,role==='complainant'?'DEMO-COMPLAINANT':null]);accounts.push({email,password,role,name,designation,bureau_id:bureau});
  }
  await tx.query("INSERT INTO system_settings(key,value) VALUES('demo_mode','true'),('duplicate_threshold','0.60'),('sla_warning_hours','24'),('approval_policy','{\"special_priority\":[\"Critical\",\"High\"]}') ON CONFLICT DO NOTHING");
 });
 await fs.writeFile(path.join(dataRoot,'demo-credentials.json'),JSON.stringify({notice:'Local isolated demonstration credentials. Do not use for real accounts.',accounts},null,2),{mode:0o600});
}
