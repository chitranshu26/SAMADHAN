import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes,createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db,query,dataRoot } from '@/lib/database/db';
import { APIError,audit,id,now,csrf,rateLimit,digest,currentUser,publicUser,verifyPassword,createSession,requireRole,scope,accessibleComplaint,hashPassword,seedDemoUsers } from '@/lib/security/auth';
import { template,queueEmail,processOutbox,smtpEnabled } from '@/lib/email';
import { createComplaint,listComplaints,complaintDetail,complaintFilter } from '@/lib/complaints';
import { actOnComplaint,appendEvent,evaluateSLA } from '@/lib/workflow';
import { analytics } from '@/lib/analytics';
import { STAGES,type Row,type User } from '@/types';
import type { ComplaintCategory } from '@/lib/ai/assistant';
const json=(data:any,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
const localDevelopment=(req:Request)=>process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1','::1','[::1]'].includes(new URL(req.url).hostname);
const local=(req:Request)=>localDevelopment(req)||process.env.PUBLIC_DEMO_ACCOUNTS==='true';
async function body(req:Request):Promise<Row>{try{return await req.json();}catch{throw new APIError(400,'A valid JSON request body is required.');}}
function parsed<T>(schema:z.ZodType<T>,data:unknown){const result=schema.safeParse(data);if(!result.success)throw new APIError(400,result.error.issues.map(i=>i.message).join('; '));return result.data;}
function assertAdmin(u:User){requireRole(u,['admin']);}
export async function handleAPI(req:Request,parts:string[]){const result=await dispatchAPI(req,parts);if(req.method==='POST'&&result.status<400&&smtpEnabled()){try{await processOutbox(3);}catch{/* Retry remains scheduled in the database-backed outbox. */}}return result;}
async function dispatchAPI(req:Request,parts:string[]){
 try{
  csrf(req);await seedDemoUsers();const url=new URL(req.url);const key=parts.join('/');const method=req.method;
  rateLimit(`all:${req.headers.get('x-forwarded-for')||'local'}`,600);
  if(parts[0]==='auth')return await auth(req,parts[1]||'',url);
  if(key==='health')return json({status:'ok',database:process.env.DATABASE_URL?'postgresql':'pglite',synthetic:true,version:'1.0.0'});
  if(key==='track'){const ticket=url.searchParams.get('ticket')||'';return json({ticket:ticket.slice(0,50),status:'Authentication required',message:'Sign in to securely track your own complaint. Public tracking does not reveal case existence or confidential information.'});}
  if(key==='scheduler'&&method==='POST'){const expected=process.env.CRON_SECRET||process.env.SCHEDULER_SECRET;if(!expected||req.headers.get('authorization')!==`Bearer ${expected}`)throw new APIError(401,'Scheduler authorization required.');return json({sla:await evaluateSLA(),email:await processOutbox()});}
  const user=(await currentUser())!;
  if(key==='bootstrap')return json({user,institutions:await query('SELECT * FROM institutions ORDER BY institution_name'),categories:await query('SELECT * FROM categories ORDER BY category_id'),subcategories:await query('SELECT * FROM subcategories ORDER BY subcategory_id'),bureaus:await query('SELECT * FROM bureaus ORDER BY bureau_id'),regions:await query('SELECT * FROM regions ORDER BY region_id'),states:await query('SELECT * FROM states ORDER BY state_name'),officers:await query("SELECT o.*,count(c.complaint_id) FILTER(WHERE c.current_stage<6)::integer workload FROM officers o LEFT JOIN complaints c ON c.dealing_assistant_id=o.officer_id WHERE o.active=true AND ($1::text IS NULL OR o.bureau_id=$1) GROUP BY o.officer_id ORDER BY o.pseudonym",[['so','director','da'].includes(user.role)?user.bureau_id:null]),settings:await settings(),stages:STAGES,demo:true});
  if(key==='complaints'&&method==='GET')return json(await listComplaints(user,url));
  if(key==='complaints'&&method==='POST'){rateLimit(`submit:${user.id}`,20);return json(await createComplaint(user,await body(req)),201);}
  if(key==='ai/analyze'&&method==='POST'){
   requireRole(user,['complainant','so','da','director']);
   rateLimit(`ai:${user.id}`,10,300000);
   const input=parsed(z.object({consent:z.literal(true),title:z.string().min(8).max(180),description:z.string().min(30).max(10000),category_id:z.string().max(40).optional()}),await body(req));
   const categories=await query('SELECT category_id,category_name FROM categories ORDER BY category_id');
   const subcategories=await query('SELECT subcategory_id,subcategory_name,category_id FROM subcategories ORDER BY subcategory_id');
   const taxonomy:ComplaintCategory[]=categories.map((category:Row)=>({category_id:String(category.category_id),category_name:String(category.category_name),subcategories:subcategories.filter((sub:Row)=>sub.category_id===category.category_id).map((sub:Row)=>({subcategory_id:String(sub.subcategory_id),subcategory_name:String(sub.subcategory_name)}))}));
   const {analyzeComplaint}=await import('@/lib/ai/assistant');
   return json({analysis:await analyzeComplaint({title:input.title,description:input.description,current_category_id:input.category_id},taxonomy)});
  }
  if(parts[0]==='complaints'&&parts[1]){
   const ticket=decodeURIComponent(parts[1]);if(parts[2]==='evidence')return await evidence(req,user,ticket,parts[3]);
   if(parts[2]==='receipt')return await receipt(user,ticket);
   if(parts.length===2&&method==='GET')return json(await complaintDetail(user,ticket));
   if(parts.length===2&&method==='POST')return json(await actOnComplaint(user,ticket,await body(req)));
  }
  if(key==='analytics'&&method==='GET'){if(user.role==='admin')throw new APIError(403,'Use system administration health metrics.');await staleSLA();return json(await analytics(user,url));}
  if(key==='institutions'&&method==='GET'){const q=(url.searchParams.get('q')||'').slice(0,150);const page=Math.max(1,Number(url.searchParams.get('page'))||1),limit=Math.min(100,Number(url.searchParams.get('pageSize'))||30);const vals:any[]=[`%${q}%`];let where='(institution_name ILIKE $1 OR institution_id ILIKE $1 OR aicte_permanent_id ILIKE $1 OR city ILIKE $1 OR district ILIKE $1)';for(const k of ['state_code','region_id','district'])if(url.searchParams.get(k)){vals.push(url.searchParams.get(k));where+=` AND ${k}=$${vals.length}`;}const total=Number((await query(`SELECT count(*) total FROM institutions WHERE ${where}`,vals))[0].total);const rows=await query(`SELECT * FROM institutions WHERE ${where} ORDER BY institution_name LIMIT $${vals.length+1} OFFSET $${vals.length+2}`,[...vals,limit,(page-1)*limit]);return json({rows,total,page,pageSize:limit});}
  if(key==='notifications'){if(method==='GET'){const rows=await query('SELECT * FROM app_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id]);return json({rows,unread:Number((await query('SELECT count(*) n FROM app_notifications WHERE user_id=$1 AND read_at IS NULL',[user.id]))[0].n)});}const input=await body(req);if(input.action==='read_all')await query('UPDATE app_notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',[user.id]);else await query('UPDATE app_notifications SET read_at=now() WHERE id=$1 AND user_id=$2',[input.id,user.id]);return json({success:true});}
  if(key==='duplicates')return await duplicateAPI(req,user,url);
  if(key==='admin')return await adminAPI(req,user,url);
  if(key==='replay')return await replayAPI(req,user,url);
  if(key==='reports')return await reports(req,user,url);
  if(key==='filters'){if(method==='GET')return json({rows:await query('SELECT * FROM saved_filters WHERE user_id=$1 ORDER BY created_at DESC',[user.id])});const input=await body(req);if(input.action==='delete')await query('DELETE FROM saved_filters WHERE id=$1 AND user_id=$2',[input.id,user.id]);else await query('INSERT INTO saved_filters(id,user_id,name,filters) VALUES($1,$2,$3,$4)',[id('FLT'),user.id,String(input.name||'Saved view').slice(0,80),JSON.stringify(input.filters||{})]);return json({success:true});}
  if(key==='profile'&&method==='POST'){const input=await body(req);if(input.password){parsed(z.string().min(12).max(128),input.password);await query('UPDATE app_users SET password_hash=$2 WHERE id=$1',[user.id,hashPassword(input.password)]);await query('DELETE FROM sessions WHERE user_id=$1',[user.id]);(await cookies()).delete('samadhan_session');}if(input.name)await query('UPDATE app_users SET name=$2 WHERE id=$1',[user.id,String(input.name).slice(0,100)]);await audit(user.id,'PROFILE_UPDATED',user.id);return json({success:true,reauthenticate:Boolean(input.password)});}
  throw new APIError(404,'API endpoint not found.');
 }catch(err){if(err instanceof APIError)return json({error:err.message},err.status);if(err instanceof z.ZodError)return json({error:err.issues.map(i=>i.message).join('; ')},400);console.error('API failure',err instanceof Error?err.message:'Unknown error');return json({error:'The operation could not be completed. Please refresh and try again.'},500);}
}
async function auth(req:Request,action:string,url:URL){
 const method=req.method;
 if(action==='me')return json({user:await currentUser(false)});
 if(action==='demo'){if(!local(req))throw new APIError(404,'Not available.');try{const data=JSON.parse(await fs.readFile(path.join(dataRoot,'demo-credentials.json'),'utf8'));return json(data);}catch{return json({accounts:[]});}}
 if(action==='outbox'){if(!localDevelopment(req))throw new APIError(404,'Not available.');const user=await currentUser(false);const email=url.searchParams.get('email');if(!user&&!email)throw new APIError(400,'Provide your registration email.');const rows=await query("SELECT id,subject,html,status,created_at FROM email_outbox WHERE recipient=$1 AND status='simulated' AND (idempotency_key LIKE 'verify:%' OR idempotency_key LIKE 'reset:%') ORDER BY created_at DESC LIMIT 5",[user?.email||email]);return json({rows,notice:'Local-only simulated verification inbox. No email has been delivered.'});}
 if(method!=='POST')throw new APIError(405,'Use POST.');
 const input=await body(req);const ip=req.headers.get('x-forwarded-for')||'local';rateLimit(`auth:${ip}`,40);
 if(action==='login'){const data=parsed(z.object({email:z.string().email(),password:z.string().min(1).max(128)}),input);rateLimit(`login:${data.email.toLowerCase()}`,12,300000);const record=(await query('SELECT * FROM app_users WHERE lower(email)=$1',[data.email.toLowerCase()]))[0];if(!record||!verifyPassword(data.password,record.password_hash)){await audit(null,'LOGIN_FAILED',null,{email_hash:digest(data.email.toLowerCase())});throw new APIError(401,'Email or password is incorrect.');}if(!record.active)throw new APIError(403,'Your account has been deactivated.');if(!record.verified)throw new APIError(403,'Verify your email before signing in. Check the local mail inbox in demo mode.');const user=publicUser(record);await createSession(user);return json({user});}
 if(action==='logout'){const token=(await cookies()).get('samadhan_session')?.value;if(token)await query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);(await cookies()).delete('samadhan_session');return json({success:true});}
 if(action==='register'){const data=parsed(z.object({email:z.string().email().max(200),password:z.string().min(12).max(128),name:z.string().min(2).max(100),person_type:z.string().max(60).optional()}),input);const email=data.email.toLowerCase();rateLimit(`register:${email}`,4,3600000);if((await query('SELECT id FROM app_users WHERE email=$1',[email])).length)throw new APIError(409,'This email is already registered. Sign in or reset your password.');const uid=id('USR'),cid=id('CPL');await (await db()).transaction(async tx=>{await tx.query('INSERT INTO complainants(complainant_id,person_type,preferred_language,identity_method,identity_assurance,apaar_verified,privacy_protected,consent_for_updates,source_type) VALUES($1,$2,\'English\',\'Email\',\'Demo email verification\',false,true,true,\'LIVE_DEMO\')',[cid,data.person_type||'Student']);await tx.query('INSERT INTO app_users(id,email,password_hash,name,role,designation,complainant_id) VALUES($1,$2,$3,$4,\'complainant\',\'Complainant\',$5)',[uid,email,hashPassword(data.password),data.name,cid]);await audit(uid,'REGISTERED',uid,{},tx);});await sendAuthToken({id:uid,email},'verify');return json({success:true,email,message:process.env.SMTP_HOST?'Verification email queued.':'Verification link created in the local simulated inbox.',simulated:!process.env.SMTP_HOST},201);}
 if(action==='verify'||action==='reset'){const token=String(input.token||'');if(!token)throw new APIError(400,'Verification token is required.');const rows=await query('SELECT t.*,u.email FROM auth_tokens t JOIN app_users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.purpose=$2 AND t.used_at IS NULL AND t.expires_at>now()',[digest(token),action==='verify'?'verify':'reset']);if(!rows.length)throw new APIError(400,'This link is invalid, expired, or already used.');if(action==='reset')parsed(z.string().min(12).max(128),input.password);await (await db()).transaction(async tx=>{if(action==='verify')await tx.query('UPDATE app_users SET verified=true WHERE id=$1',[rows[0].user_id]);else{await tx.query('UPDATE app_users SET password_hash=$2 WHERE id=$1',[rows[0].user_id,hashPassword(input.password)]);await tx.query('DELETE FROM sessions WHERE user_id=$1',[rows[0].user_id]);}await tx.query('UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1',[digest(token)]);await audit(rows[0].user_id,action==='verify'?'EMAIL_VERIFIED':'PASSWORD_RESET',rows[0].user_id,{},tx);});return json({success:true,message:action==='verify'?'Email verified. You can now sign in.':'Password reset. Sign in with your new password.'});}
 if(action==='forgot'||action==='resend'){const email=parsed(z.string().email(),input.email).toLowerCase();rateLimit(`token:${email}`,3,3600000);const record=(await query('SELECT * FROM app_users WHERE email=$1 AND active=true',[email]))[0];if(record&&(action==='forgot'||!record.verified))await sendAuthToken(record,action==='forgot'?'reset':'verify');return json({success:true,message:'If the account is eligible, a secure link has been queued.',simulated:!process.env.SMTP_HOST});}
 throw new APIError(404,'Authentication action not found.');
}
async function sendAuthToken(user:Row,purpose:string){const token=randomBytes(32).toString('base64url');await (await db()).transaction(async tx=>{await tx.query('INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+INTERVAL \'1 hour\')',[digest(token),user.id,purpose]);const url=`${process.env.APP_URL||'http://localhost:3000'}/${purpose==='verify'?'verify':'reset-password'}?token=${token}`;await queueEmail(tx,user,`${purpose}:${digest(token)}`,purpose==='verify'?'Verify your SAMADHAN email':'Reset your SAMADHAN password','This secure link expires in one hour. If you did not request it, ignore this message.',url);});}
async function settings(){const rows=await query('SELECT key,value FROM system_settings');return Object.fromEntries(rows.map(r=>[r.key,r.value]));}
let lastSLA=0;async function staleSLA(){if(Date.now()-lastSLA>60000){lastSLA=Date.now();await evaluateSLA();}}

async function evidence(req:Request,user:User,ticket:string,evidenceId?:string){
 const c=await accessibleComplaint(user,ticket);if(user.role==='chairman')throw new APIError(403,'Leadership dashboards exclude sensitive evidence.');
 if(req.method==='GET'){if(!evidenceId)throw new APIError(400,'Evidence ID required.');const record=(await query('SELECT * FROM app_evidence WHERE id=$1 AND complaint_id=$2',[evidenceId,ticket]))[0];if(!record)throw new APIError(404,'This evidence is metadata-only or unavailable.');if(user.role==='complainant'&&record.visibility!=='public')throw new APIError(403,'Evidence access restricted.');const resolved=path.resolve(dataRoot,'evidence',record.storage_path);const base=path.resolve(dataRoot,'evidence')+path.sep;if(!resolved.startsWith(base))throw new APIError(400,'Invalid storage reference.');const bytes=await fs.readFile(resolved);return new Response(bytes,{headers:{'Content-Type':record.mime,'Content-Disposition':`attachment; filename="${record.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(req.method!=='POST')throw new APIError(405,'Use GET or POST.');if(!['complainant','so','da','director'].includes(user.role))throw new APIError(403,'Upload not authorized.');rateLimit(`upload:${user.id}`,20);const form=await req.formData();const file=form.get('file');if(!(file instanceof File))throw new APIError(400,'Select a file to upload.');if(!file.size||file.size>10*1024*1024)throw new APIError(400,'Upload a file between 1 byte and 10 MB.');const ext=path.extname(file.name).toLowerCase();const allowed:Row={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};if(!allowed[ext])throw new APIError(400,'Supported files: PDF, PNG, JPEG, WebP and DOCX.');const bytes=Buffer.from(await file.arrayBuffer());const valid=ext==='.pdf'?bytes.subarray(0,5).toString()==='%PDF-':ext==='.png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):['.jpg','.jpeg'].includes(ext)?bytes[0]===255&&bytes[1]===216:ext==='.webp'?bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP':bytes.subarray(0,2).toString()==='PK';if(!valid)throw new APIError(400,'File content does not match its extension.');const eid=id('EVD');const filename=`${eid}${ext}`;await fs.mkdir(path.join(dataRoot,'evidence'),{recursive:true});await fs.writeFile(path.join(dataRoot,'evidence',filename),bytes,{mode:0o600});const description=String(form.get('description')||'').slice(0,1000);const visibility=user.role==='complainant'?'public':form.get('visibility')==='internal'?'internal':'public';try{await (await db()).transaction(async tx=>{await tx.query('INSERT INTO app_evidence(id,complaint_id,uploaded_by,name,mime,size_bytes,sha256,storage_path,description,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[eid,ticket,user.id,path.basename(file.name).slice(0,200),allowed[ext],bytes.length,createHash('sha256').update(bytes).digest('hex'),filename,description,visibility]);await tx.query('UPDATE complaints SET current_evidence_count=coalesce(current_evidence_count,0)+1 WHERE complaint_id=$1',[ticket]);await appendEvent(tx,c,user,'EVIDENCE_UPLOADED',description||'Supporting evidence uploaded to private demonstration storage.',visibility,eid);});}catch(e){await fs.unlink(path.join(dataRoot,'evidence',filename)).catch(()=>{});throw e;}return json({id:eid,evidence_id:eid,name:file.name,size_bytes:file.size,message:'Evidence saved in private storage.'},201);
}
async function duplicateAPI(req:Request,user:User,url:URL){
 if(req.method==='POST'){
  const input=await body(req);
  if(input.action==='preview'){
   const {detectDuplicates}=await import('@/lib/ai/duplicate');const candidates=await query('SELECT * FROM complaints WHERE institution_id=$1 AND is_draft=false ORDER BY submitted_at_utc DESC LIMIT 200',[input.institution_id]);const matches=await detectDuplicates({...input,complainant_id:user.complainant_id,current_bureau_id:(await query('SELECT default_bureau_id FROM categories WHERE category_id=$1',[input.category_id]))[0]?.default_bureau_id},candidates);const filtered=matches.filter(m=>m.confidence>=.45&&!['INDEPENDENT','SAME_INSTITUTION_ONLY'].includes(m.label)).slice(0,8);
   return json({candidates:filtered.map(m=>{const candidate=candidates.find(c=>c.complaint_id===m.case_id);return user.role==='complainant'?{id:m.case_id,label:m.label,confidence:m.confidence,reasons:m.reasons,own_case_id:candidate?.complainant_id===user.complainant_id?m.case_id:undefined,message:'A potentially related synthetic incident exists. An officer will review it.'}:{...m,complaint:undefined};}),advisory:'AI suggestions require human review and never automatically delete or merge complaints.'});
  }
  requireRole(user,['so','director']);const decision=String(input.decision||input.action||'');const decisions=['confirm','reject','link','merge','manual_review','escalate','independent','reverse'];if(!decisions.includes(decision))throw new APIError(400,'Choose a valid review decision.');const reason=String(input.reason||input.remarks||'');if(reason.trim().length<5)throw new APIError(400,'Record a review reason of at least 5 characters.');let candidate=(await query('SELECT * FROM app_duplicate_candidates WHERE id=$1',[input.id]))[0];if(!candidate){const h=(await query('SELECT * FROM nlp_candidate_pairs WHERE candidate_pair_id=$1',[input.id]))[0];if(!h)throw new APIError(404,'Candidate not found.');candidate={id:h.candidate_pair_id,case_id_a:h.case_id_a,case_id_b:h.case_id_b,label:h.ground_truth_synthetic,confidence:h.model_confidence_simulated,features:{source:'historical_simulated'},reasons:['Imported synthetic candidate; score is historical simulation metadata.']};}
  const a=await accessibleComplaint(user,candidate.case_id_a);await accessibleComplaint(user,candidate.case_id_b);const status:Row={confirm:'confirmed',reject:'rejected',link:'linked',merge:'merged',manual_review:'manual_review',escalate:'escalated',independent:'independent',reverse:'pending'};await (await db()).transaction(async tx=>{await tx.query('INSERT INTO app_duplicate_candidates(id,case_id_a,case_id_b,label,confidence,features,reasons,status,reviewer_id,reason,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(id) DO UPDATE SET status=excluded.status,reviewer_id=excluded.reviewer_id,reason=excluded.reason,reviewed_at=now()',[candidate.id,candidate.case_id_a,candidate.case_id_b,candidate.label,candidate.confidence,JSON.stringify(candidate.features),JSON.stringify(candidate.reasons),status[decision],user.officer_id,reason]);if(['confirm','link','merge','escalate','reverse'].includes(decision)){const relation=decision==='merge'?'DUPLICATE_PRIMARY_LINK':decision==='confirm'?'CONFIRMED_DUPLICATE':decision==='reverse'?'DECISION_REVERSED':'RELATED_CASE';await tx.query('INSERT INTO case_links(link_id,case_id_a,case_id_b,institution_id,relation_type,human_decision,reviewed_by_officer_id,reviewed_at_utc,notes) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8)',[id('LINK'),candidate.case_id_a,candidate.case_id_b,a.institution_id,relation,status[decision],user.officer_id,reason]);}await appendEvent(tx,a,user,decision==='merge'?'DUPLICATE_MERGED':'DUPLICATE_REVIEWED',`Human duplicate review recorded: ${status[decision]}. Both complaint identifiers are preserved.`,'internal',candidate.id,{decision,reason,other_case:candidate.case_id_b});});return json({success:true,status:status[decision],message:'Review saved. Both original complaint records and prior decisions remain traceable.'});
 }
 requireRole(user,['so','director','chairman']);const f=complaintFilter(user,url);const page=Math.max(1,Number(url.searchParams.get('page'))||1),limit=30;const status=url.searchParams.get('status');const historical=await query(`SELECT n.candidate_pair_id id,n.case_id_a,n.case_id_b,n.ground_truth_synthetic label,n.model_confidence_simulated confidence,n.review_status status,'historical_simulated' source,c.title title_a,c.current_bureau_id bureau_a,c.current_stage stage_a,i.institution_name,c.institution_id,b.title title_b,b.current_bureau_id bureau_b,b.current_stage stage_b,n.incident_days_apart,n.same_complainant,n.same_category,n.same_institution FROM nlp_candidate_pairs n JOIN complaints c ON c.complaint_id=n.case_id_a JOIN complaints b ON b.complaint_id=n.case_id_b LEFT JOIN institutions i ON i.institution_id=c.institution_id WHERE ${f.sql} AND NOT EXISTS(SELECT 1 FROM app_duplicate_candidates d WHERE d.id=n.candidate_pair_id) ORDER BY n.candidate_created_at_utc DESC LIMIT 200`,f.params);const live=await query(`SELECT d.*,d.id,d.label,d.confidence,d.status,'trained_lexical' source,c.title title_a,c.current_bureau_id bureau_a,c.current_stage stage_a,i.institution_name,c.institution_id,b.title title_b,b.current_bureau_id bureau_b,b.current_stage stage_b FROM app_duplicate_candidates d JOIN complaints c ON c.complaint_id=d.case_id_a JOIN complaints b ON b.complaint_id=d.case_id_b LEFT JOIN institutions i ON i.institution_id=c.institution_id WHERE ${f.sql} ORDER BY d.created_at DESC LIMIT 200`,f.params);const all=[...live,...historical];for(const row of all){if(user.role!=='chairman'&&row.bureau_b!==user.bureau_id){row.title_b='Restricted cross-bureau case';row.restricted=true;}row.reasons=row.reasons||['Imported synthetic candidate; simulated historical score, not live inference.'];row.case_a={complaint_id:row.case_id_a,title:row.title_a,current_bureau_id:row.bureau_a,current_stage:row.stage_a};row.case_b={complaint_id:row.case_id_b,title:row.title_b,current_bureau_id:row.bureau_b,current_stage:row.stage_b};}
 const filtered=status&&status!=='all'?all.filter(r=>r.status===status):all;let model:Row={};try{model=await(await import('@/lib/ai/duplicate')).modelInfo();}catch{}return json({rows:filtered.slice((page-1)*limit,page*limit),total:filtered.length,page,pageSize:limit,stats:{total:all.length,pending:all.filter(r=>r.status==='pending').length,confirmed:all.filter(r=>r.status==='confirmed'||r.status==='merged').length,rejected:all.filter(r=>r.status==='rejected').length,cross_bureau:all.filter(r=>r.bureau_a!==r.bureau_b).length},model});
}

async function adminAPI(req: Request, user: User, url: URL) {
  assertAdmin(user);

  if (req.method === 'GET') {
    const count = (
      await query(
        "SELECT count(*)::integer complaints,count(*) FILTER(WHERE record_origin='live_demo')::integer live FROM complaints"
      )
    )[0];

    let summary: Row = {};
    let progress: Row = {};

    try {
      summary = JSON.parse(
        await fs.readFile(
          path.join(dataRoot, 'import/import-summary.json'),
          'utf8'
        )
      );
    } catch {}

    try {
      progress = JSON.parse(
        await fs.readFile(
          path.join(dataRoot, 'import/database-progress.json'),
          'utf8'
        )
      );
    } catch {}

    const settingsData = await settings();

    const outbox = await query(
      'SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 100'
    );

    return json({
      users: await query(
        'SELECT id,email,name,role,designation,bureau_id,region_id,officer_id,verified,active,created_at FROM app_users ORDER BY role,name'
      ),

      settings: settingsData,
      outbox,
      emails: outbox,

      health: {
        status: 'healthy',

        database: process.env.DATABASE_URL
          ? 'PostgreSQL'
          : 'Persistent local PGlite (PostgreSQL)',

        database_status: 'connected',

        email: process.env.SMTP_HOST
          ? 'SMTP configured; delivery acceptance recorded per attempt'
          : 'Simulated local outbox',

        realtime:
          'Authorized polling (15 seconds); Supabase Realtime adapter available when configured',

        complaints: count.complaints,
        live_demo_complaints: count.live,

        supabase_configured: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL
        ),

        smtp_configured: Boolean(process.env.SMTP_HOST),
        synthetic: true,

        scheduler: await query(
          'SELECT * FROM scheduled_jobs'
        )
      },

      imports: await query(
        'SELECT * FROM import_jobs ORDER BY started_at DESC LIMIT 20'
      ),

      import_summary: summary,
      import_progress: progress,

      audit: await query(
        'SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN app_users u ON u.id=a.actor_id ORDER BY created_at DESC LIMIT 100'
      ),

      policies: await query(
        'SELECT p.*,c.category_name FROM sla_policies p JOIN categories c USING(category_id) ORDER BY p.category_id'
      ),

      routing: await query(
        'SELECT * FROM categories ORDER BY category_id'
      ),

      regions: await query('SELECT * FROM regions'),
      states: await query('SELECT * FROM states'),
      bureaus: await query('SELECT * FROM bureaus'),

      templates: settingsData.notification_templates || {},

      model: await (
        await import('@/lib/ai/duplicate')
      ).modelInfo()
    });
  }

  const input = await body(req);
  const action = String(input.action || '');

  let result: Row = { success: true };

  // =====================================================
  // NEW FEATURE: ADMIN REGISTRATION APPROVAL / REJECTION
  // =====================================================

  if (action === 'registration_decide') {

    const targetId = parsed(
      z.string().min(1).max(100),
      input.id
    );

    const decision = parsed(
      z.enum(['approve', 'reject']),
      input.decision
    );

    const reason = String(input.reason ?? '').trim();

    if (decision === 'reject' && reason.length < 5) {
      throw new APIError(
        400,
        'Please provide a rejection reason.'
      );
    }

    if (reason.length > 500) {
      throw new APIError(
        400,
        'Reason must be under 500 characters.'
      );
    }

    await (await db()).transaction(async (tx) => {

      const records = await tx.query(
        `SELECT id, role, verified, active
         FROM app_users
         WHERE id = $1
         FOR UPDATE`,
        [targetId]
      );

      const target = records.rows[0];

      if (
        !target ||
        target.role !== 'complainant' ||
        target.verified ||
        !target.active
      ) {
        throw new APIError(
          409,
          'No pending active complainant account found.'
        );
      }

      const approved = decision === 'approve';

      await tx.query(
        `UPDATE app_users
         SET verified = $2,
             active = $3
         WHERE id = $1`,
        [targetId, approved, approved]
      );

      await tx.query(
        `DELETE FROM auth_tokens
         WHERE user_id = $1
         AND purpose = 'verify'`,
        [targetId]
      );

      await tx.query(
        'DELETE FROM sessions WHERE user_id = $1',
        [targetId]
      );

      await audit(
        user.id,
        approved
          ? 'REGISTRATION_APPROVED'
          : 'REGISTRATION_REJECTED',
        targetId,
        { reason },
        tx
      );

    });

    result = {
      success: true,

      message:
        decision === 'approve'
          ? 'User approved successfully.'
          : 'User registration rejected.'
    };

  }

  // =====================================================
  // EXISTING FEATURE: USER MANAGEMENT
  // =====================================================

  else if (action === 'user_update') {

    const target = (
      await query(
        'SELECT * FROM app_users WHERE id=$1',
        [input.id]
      )
    )[0];

    if (!target) {
      throw new APIError(404, 'User not found.');
    }

    const allowedRoles = [
      'complainant',
      'so',
      'da',
      'director',
      'chairman',
      'admin'
    ];

    const role = input.role || target.role;

    if (!allowedRoles.includes(role)) {
      throw new APIError(400, 'Invalid role.');
    }

    if (
      target.id === user.id &&
      (input.active === false || role !== 'admin')
    ) {
      throw new APIError(
        400,
        'You cannot remove your own administrator access.'
      );
    }

    const bureau = ['so', 'da', 'director'].includes(role)
      ? input.bureau_id || target.bureau_id
      : null;

    if (
      ['so', 'da', 'director'].includes(role) &&
      !bureau
    ) {
      throw new APIError(
        400,
        'Assign a bureau to this officer role.'
      );
    }

    if (
      role === 'complainant' &&
      !target.complainant_id
    ) {
      throw new APIError(
        400,
        'This account has no complainant identity; register a complainant account instead.'
      );
    }

    const region =
      input.region_id === null || input.region_id === ''
        ? null
        : input.region_id || target.region_id;

    let officer = target.officer_id;

    if (
      ['so', 'da', 'director'].includes(role) &&
      !officer
    ) {
      officer = `OFF-${target.id}`;
    }

    await (await db()).transaction(async (tx) => {

      if (officer) {
        await tx.query(
          `INSERT INTO officers(
            officer_id,
            pseudonym,
            bureau_id,
            region_id,
            role,
            active,
            on_duty_from,
            source_type
          )
          VALUES(
            $1,$2,$3,$4,$5,$6,
            CURRENT_DATE,
            'LIVE_DEMO'
          )
          ON CONFLICT(officer_id)
          DO UPDATE SET
            bureau_id=excluded.bureau_id,
            region_id=excluded.region_id,
            role=excluded.role,
            active=excluded.active`,
          [
            officer,
            target.name,
            bureau,
            region,
            ({
              so: 'Section Officer',
              da: 'Dealing Assistant',
              director: 'Director'
            } as Row)[role] || 'Inactive officer',
            input.active ?? target.active
          ]
        );
      }

      await tx.query(
        `UPDATE app_users
         SET role=$2,
             bureau_id=$3,
             region_id=$4,
             active=$5,
             officer_id=$6
         WHERE id=$1`,
        [
          target.id,
          role,
          bureau,
          region,
          input.active ?? target.active,
          officer
        ]
      );

      if (
        input.active === false ||
        role !== target.role
      ) {
        await tx.query(
          'DELETE FROM sessions WHERE user_id=$1',
          [target.id]
        );
      }

      await audit(
        user.id,
        'USER_UPDATED',
        target.id,
        {
          role,
          bureau,
          region,
          active: input.active
        },
        tx
      );

    });

  }

  // =====================================================
  // EXISTING FEATURE: SYSTEM SETTINGS
  // =====================================================

  else if (action === 'setting_update') {

    const key = String(input.key || '');

    if (![
      'duplicate_threshold',
      'sla_warning_hours',
      'demo_mode',
      'replay_enabled',
      'approval_policy',
      'notification_templates',
      'required_documents',
      'institution_aliases',
      'geographic_mapping_source'
    ].includes(key)) {
      throw new APIError(
        400,
        'This setting cannot be changed through the application.'
      );
    }

    if (
      key === 'duplicate_threshold' &&
      (
        Number(input.value) < 0.1 ||
        Number(input.value) > 1
      )
    ) {
      throw new APIError(
        400,
        'Threshold must be between 0.1 and 1.'
      );
    }

    await query(
      `INSERT INTO system_settings(key,value,updated_by)
       VALUES($1,$2,$3)
       ON CONFLICT(key)
       DO UPDATE SET
         value=excluded.value,
         updated_by=excluded.updated_by,
         updated_at=now()`,
      [
        key,
        JSON.stringify(input.value),
        user.id
      ]
    );

  }

  // =====================================================
  // EXISTING FEATURE: SLA MANAGEMENT
  // =====================================================

  else if (action === 'sla_update') {

    const hours = Number(input.target_hours);

    if (
      !Number.isFinite(hours) ||
      hours < 1 ||
      hours > 8760
    ) {
      throw new APIError(
        400,
        'SLA hours must be between 1 and 8760.'
      );
    }

    await query(
      `UPDATE sla_policies
       SET target_hours=$2,
           policy_source='ADMIN_DEMO_CONFIGURATION'
       WHERE sla_policy_id=$1`,
      [input.sla_policy_id, hours]
    );

    await query(
      `UPDATE categories
       SET proposed_sla_days=$2
       WHERE category_id=(
         SELECT category_id
         FROM sla_policies
         WHERE sla_policy_id=$1
       )`,
      [
        input.sla_policy_id,
        Math.ceil(hours / 24)
      ]
    );

    result.message =
      'Policy updated for future complaints. Existing deadlines preserve their submission-time policy.';

  }

  // =====================================================
  // EXISTING FEATURE: ROUTING MANAGEMENT
  // =====================================================

  else if (action === 'routing_update') {

    await query(
      `UPDATE categories
       SET default_bureau_id=$2
       WHERE category_id=$1`,
      [
        input.category_id,
        input.bureau_id
      ]
    );

  }

  // =====================================================
  // EXISTING FEATURE: GEOGRAPHY MANAGEMENT
  // =====================================================

  else if (action === 'geography_update') {

    await query(
      `UPDATE states
       SET region_id=$2,
           jurisdiction_source=$3,
           jurisdiction_current_verified=$4
       WHERE state_code=$1`,
      [
        input.state_code,
        input.region_id,
        String(
          input.source ||
          'Administrator demonstration mapping'
        ),
        Boolean(input.verified)
      ]
    );

  }

  // =====================================================
  // EXISTING FEATURE: SLA EXECUTION
  // =====================================================

  else if (action === 'run_sla') {

    result = {
      success: true,
      ...await evaluateSLA()
    };

  }

  // =====================================================
  // EXISTING FEATURE: EMAIL RETRY
  // =====================================================

  else if (action === 'retry_email') {

    if (!process.env.SMTP_HOST) {
      throw new APIError(
        409,
        'Configure SMTP to deliver actual messages. The simulated inbox already contains local messages.'
      );
    }

    await query(
      `UPDATE email_outbox
       SET status='pending',
           attempts=0,
           next_attempt_at=now()
       WHERE id=$1
       AND status IN ('failed','simulated')`,
      [input.id]
    );

    result = {
      success: true,
      ...await processOutbox()
    };

  }

  // =====================================================
  // EXISTING FEATURE: TEST EMAIL
  // =====================================================

  else if (action === 'send_test_email') {

    const recipient = parsed(
      z.string().email(),
      input.email || user.email
    );

    await queueEmail(
      await db(),
      { ...user, email: recipient },
      id('TEST'),
      'SAMADHAN | Email Transport Test',
      'This is a synthetic demonstration transport test. Provider acceptance is logged only when SMTP accepts the message.',
      process.env.APP_URL || 'http://localhost:3000'
    );

    result = {
      success: true,
      ...await processOutbox(),

      message: process.env.SMTP_HOST
        ? 'Test message queued and delivery attempted; inspect the status log.'
        : 'Test message saved in the simulated inbox. No external email was sent.'
    };

  }

  // =====================================================
  // EXISTING FEATURE: NOTIFICATION TEMPLATES
  // =====================================================

  else if (action === 'save_template') {

    const templates =
      (await settings()).notification_templates || {};

    const code = String(
      input.code || 'STATUS_UPDATE'
    ).slice(0, 80);

    templates[code] = {
      subject: String(
        input.subject ||
        'SAMADHAN | Complaint Status Update'
      ).slice(0, 180),

      message: String(
        input.message ||
        'A complaint status update is available.'
      ).slice(0, 3000)
    };

    await query(
      `INSERT INTO system_settings(key,value,updated_by)
       VALUES('notification_templates',$1,$2)
       ON CONFLICT(key)
       DO UPDATE SET
         value=excluded.value,
         updated_by=excluded.updated_by,
         updated_at=now()`,
      [
        JSON.stringify(templates),
        user.id
      ]
    );

  }

  // =====================================================
  // EXISTING FEATURE: DATASET IMPORT
  // =====================================================

  else if (action === 'run_import') {

    const running = await query(
      `SELECT id
       FROM import_jobs
       WHERE status='running'
       AND started_at>now()-INTERVAL '1 hour'`
    );

    if (running.length) {
      throw new APIError(
        409,
        'An import is already running.'
      );
    }

    const job = id('IMP');

    await query(
      `INSERT INTO import_jobs(id,mode,status)
       VALUES($1,'incremental prepared dataset','running')`,
      [job]
    );

    void importPrepared(job).catch(async (e) => {

      await query(
        `UPDATE import_jobs
         SET status='failed',
             details=$2,
             completed_at=now()
         WHERE id=$1`,
        [
          job,
          JSON.stringify({
            error: e instanceof Error
              ? e.message
              : 'Import failed'
          })
        ]
      );

    });

    result = {
      success: true,
      job_id: job,
      message:
        'Prepared connected dataset import started. Progress is persisted in Import Jobs.'
    };

  }

  // =====================================================
  // EXISTING FEATURE: DATA VALIDATION
  // =====================================================

  else if (action === 'validate_data') {

    const violations = await query(
      `SELECT c.complaint_id
       FROM complaints c
       LEFT JOIN institutions i USING(institution_id)
       LEFT JOIN categories k USING(category_id)
       WHERE i.institution_id IS NULL
          OR k.category_id IS NULL
       LIMIT 30`
    );

    result = {
      success: violations.length === 0,
      violations,

      complaints: Number(
        (
          await query(
            'SELECT count(*) n FROM complaints'
          )
        )[0].n
      ),

      message: violations.length
        ? 'Referential validation found issues.'
        : 'Database foreign-key validation passed.'
    };

  }

  else {
    throw new APIError(
      400,
      'Unknown administrator action.'
    );
  }

  // =====================================================
  // EXISTING FEATURE: ADMINISTRATOR AUDIT LOGGING
  // =====================================================

  await audit(
    user.id,
    `ADMIN_${action.toUpperCase()}`,
    String(
      input.id ||
      input.key ||
      input.category_id ||
      'system'
    ),
    { action }
  );

  return json(result);
}

async function importPrepared(job:string){
 const summary=JSON.parse(await fs.readFile(path.join(dataRoot,'import/import-summary.json'),'utf8'));const manifest=JSON.parse(await fs.readFile(path.join(process.cwd(),'work/dataset-reference/manifest.json'),'utf8'));const master=['regions','states','bureaus','categories','subcategories','sla_policies','institutions','institution_aliases','complainants','officers'];const facts=['complaints','assignments','case_bureau_history','notices','internal_case_logs','institution_responses','case_outcomes','approvals','evidence_metadata','case_stage_history','workflow_events','notifications','sla_tracking','investigations','escalations','feedback_appeals','nlp_candidate_pairs','case_links','live_replay_7d'];let processed=0;const failed:Row[]=[];
 for(const table of [...master,...facts]){const file=path.join(dataRoot,'import',master.includes(table)?'master':'facts',`${table}.jsonl`);try{await fs.access(file);}catch{continue;}const columns=manifest.tables[table]?.columns;if(!columns||!/^[a-z_0-9]+$/.test(table))continue;let batch:Row[]=[];const flush=async()=>{if(!batch.length)return;const data=batch;batch=[];try{await query(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.join(',')} FROM json_populate_recordset(NULL::${table},$1::json) ON CONFLICT DO NOTHING`,[JSON.stringify(data)]);processed+=data.length;}catch(e){failed.push({table,rows:data.length,error:e instanceof Error?e.message:'failed'});}await query('UPDATE import_jobs SET progress=$2,details=$3 WHERE id=$1',[job,Math.min(99,Math.floor(processed/(Number(summary.total_rows)||300000)*100)),JSON.stringify({table,processed,failed_batches:failed.length})]);};for await(const line of readline.createInterface({input:createReadStream(file),crlfDelay:Infinity})){if(!line.trim())continue;batch.push(JSON.parse(line));if(batch.length>=300)await flush();}await flush();}
 await fs.writeFile(path.join(dataRoot,'import',`${job}-failed.json`),JSON.stringify(failed,null,2));await query('UPDATE import_jobs SET status=$2,progress=100,details=$3,completed_at=now() WHERE id=$1',[job,failed.length?'completed_with_errors':'completed',JSON.stringify({processed,failed_batches:failed.length})]);
}

async function replayAPI(req:Request,user:User,url:URL){
 requireRole(user,['so','da','director','chairman','admin']);
 let session=(await query('SELECT * FROM replay_sessions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1',[user.id]))[0];if(!session){session={id:id('REPLAY'),user_id:user.id,status:'stopped',speed:1,cursor_index:0,filters:{}};await query('INSERT INTO replay_sessions(id,user_id) VALUES($1,$2)',[session.id,user.id]);}
 if(req.method==='POST'){const input=await body(req);const action=String(input.action||'');if(!['start','pause','resume','stop','speed','filter'].includes(action))throw new APIError(400,'Invalid replay control.');const states:Row={start:'running',pause:'paused',resume:'running',stop:'stopped'};const status=states[action]||session.status;const speed=Math.min(10,Math.max(1,Number(input.speed)||session.speed));const cursor=action==='start'||action==='stop'?0:session.cursor_index;const filters=input.filters||session.filters;await query('UPDATE replay_sessions SET status=$2,speed=$3,cursor_index=$4,filters=$5,updated_at=now() WHERE id=$1',[session.id,status,speed,cursor,JSON.stringify(filters)]);await audit(user.id,'REPLAY_CONTROL',session.id,{action,speed});return json({success:true,session:{...session,status,speed,cursor_index:cursor,filters},notice:'Historical simulation playback. Business records and operational metrics are not modified.'});}
 const s=scope(user,'c');const params=[...s.params];const wheres=[user.role==='admin'?'TRUE':s.sql];const filters={...session.filters,...Object.fromEntries(url.searchParams)};for(const[k,col]of [['region_id','region_id'],['bureau_id','bureau_id'],['event_type','event_type']])if(filters[k]&&filters[k]!=='all'){params.push(filters[k]);wheres.push(`e.${col}=$${params.length}`);}const cursor=Math.max(0,Number(url.searchParams.get('cursor'))||0);const limit=Math.min(300,Math.max(1,Number(url.searchParams.get('limit'))||100));const where=wheres.join(' AND ');const rows=await query(`SELECT e.*,c.title,c.record_origin FROM live_replay_7d e JOIN complaints c USING(complaint_id) WHERE ${where} ORDER BY e.occurred_at_utc,e.event_id LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,cursor]);const total=Number((await query(`SELECT count(*) n FROM live_replay_7d e JOIN complaints c USING(complaint_id) WHERE ${where}`,params))[0].n);return json({rows,total,cursor,next_cursor:cursor+rows.length,session,notice:'Historical simulation playback; not a live AICTE feed. Playback leaves current case state unchanged.'});
}
function csvCell(value:any){const s=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
async function reports(req:Request,user:User,url:URL){
 if(url.searchParams.get('type')==='acknowledgment'&&url.searchParams.get('complaint_id'))return receipt(user,url.searchParams.get('complaint_id')!);
 if(user.role==='admin')throw new APIError(403,'Administrators cannot export investigation content.');const type=url.searchParams.get('type')||'case-register';if(type==='sla')url.searchParams.set('sla','breached');if(type==='pending')url.searchParams.set('stage',url.searchParams.get('stage')||'1');if(type==='duplicates')url.searchParams.set('duplicate','true');url.searchParams.set('pageSize','10000');url.searchParams.set('page','1');const result=await listComplaints(user,url,true);const cols=['complaint_id','institution_id','institution_name','category_name','current_bureau_id','region_id','state_code','current_stage','current_status','priority','submitted_at_utc','sla_due_at_utc','sla_breached','closed_at_utc','record_origin'];const data=result.rows.map(r=>Object.fromEntries(cols.map(c=>[c,r[c]])));const format=url.searchParams.get('format')||'csv';await audit(user.id,'REPORT_EXPORTED',type,{rows:data.length,total:result.total,format});const name=`SAMADHAN-${type}-${new Date().toISOString().slice(0,10)}`;
 if(format==='xlsx'){const ExcelJS=await import('exceljs');const wb=new ExcelJS.Workbook();wb.creator='SAMADHAN Independent Demo';const ws=wb.addWorksheet('Synthetic complaint register');ws.columns=cols.map(c=>({header:c.replaceAll('_',' '),key:c,width:c.includes('name')?40:22}));ws.addRows(data);ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B1D38'}};ws.autoFilter={from:'A1',to:`P${data.length+1}`};ws.views=[{state:'frozen',ySplit:1}];const info=wb.addWorksheet('Provenance');info.addRow(['Independent demonstration. Synthetic data only.']);info.addRow(['All exported records are limited to your authorized filters.']);info.addRow(['Report',type,'Rows',data.length,'Matching total',result.total]);const bytes=await wb.xlsx.writeBuffer();return new Response(bytes as any,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${name}.xlsx"`,'Cache-Control':'no-store'}});}
 if(format==='pdf'){const a=await analytics(user,url);const lines=[`SAMADHAN - ${type.replaceAll('-',' ').toUpperCase()}`,'Independent demonstration - synthetic data only',`Generated ${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`,`Authorized records: ${result.total}`,`Total ${a.metrics.total} | Active ${a.metrics.active} | Closed ${a.metrics.closed}`,`Resolution rate ${a.metrics.resolution_rate}% | SLA compliance ${a.metrics.sla_compliance}%`,'',...data.slice(0,150).map(r=>`${r.complaint_id} | Stage ${r.current_stage} | ${r.current_bureau_id} | ${r.current_status}`),'','PDF lists at most 150 records. Use CSV/XLSX for the full filtered register.'];return pdfResponse(lines,`${name}.pdf`);}
 const csv='\uFEFF'+[cols.map(csvCell).join(','),...data.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\r\n');return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}.csv"`,'Cache-Control':'no-store','X-Export-Count':String(data.length),'X-Matching-Count':String(result.total)}});
}
async function receipt(user:User,ticket:string){const c=await accessibleComplaint(user,ticket);if(user.role==='chairman')throw new APIError(403,'Acknowledgments are restricted to the complainant and authorized case officers.');return pdfResponse(['SAMADHAN - COMPLAINT ACKNOWLEDGMENT','Independent demonstration. Synthetic complaint data.',`Ticket: ${c.complaint_id}`,`Institution: ${c.institution_name}`,`Category: ${c.category_name}`,`Submitted: ${new Date(c.submitted_at_utc).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`,`Status: ${c.current_status}`,`Bureau: ${c.bureau_name}`,`Demonstration SLA deadline: ${new Date(c.sla_due_at_utc).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`,'','This receipt confirms database registration in the independent demo system.','It does not constitute an official AICTE acknowledgment.','Sign in to SAMADHAN to securely view the current public case timeline.'],`${ticket}-acknowledgment.pdf`);}
function pdfResponse(lines:string[],filename:string){
 const printable=(s:string)=>s.normalize('NFKD').replace(/[^\x20-\x7E]/g,' ').replace(/[()\\]/g,c=>'\\'+c);const pages:string[][]=[];for(let i=0;i<lines.length;i+=48)pages.push(lines.slice(i,i+48));const objects:string[]=[];objects.push('<< /Type /Catalog /Pages 2 0 R >>');objects.push(`<< /Type /Pages /Kids [${pages.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`);objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');pages.forEach((page,i)=>{const content='BT /F1 10 Tf 40 800 Td 15 TL '+page.map((line,j)=>`${j?'T* ':''}(${printable(line.slice(0,130))}) Tj`).join('\n')+' ET';objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);});let output='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(output));output+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Response(Buffer.from(output),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store'}});
}
