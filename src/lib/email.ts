import { db } from '@/lib/database/db';
import { id } from '@/lib/security/auth';
import type { Row } from '@/types';
import { publicComplaintUpdate, complaintEmailMessage } from '@/lib/complaint-email';
const escape=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function smtpEnabled(){return Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM&&process.env.ALLOW_REAL_EMAIL==='true');}
export function template(title:string,message:string,url:string){return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#17314e"><main style="max-width:600px;margin:30px auto;background:white;border-radius:16px;overflow:hidden"><header style="background:#0b1d38;color:white;padding:30px"><strong style="font-size:26px">SAMADHAN</strong><p>Intelligent Grievance Monitoring. Transparent Resolution.</p></header><section style="padding:30px"><h2>${escape(title)}</h2><p style="line-height:1.7;white-space:pre-line">${escape(message)}</p><a href="${escape(url)}" style="display:inline-block;background:#2563eb;color:white;padding:13px 20px;border-radius:8px;text-decoration:none">Open secure workspace</a><p style="margin-top:30px">Regards,<br>SAMADHAN Notification Bot</p></section><footer style="padding:20px;background:#eff6ff;font-size:12px">Independent demonstration platform. All complaint records are synthetic. This is not an official AICTE communication.</footer></main></body></html>`;}
export async function queueEmail(tx:any,user:Row,key:string,title:string,message:string,url:string){
 const text=[title,message,`Secure workspace: ${url}`,'SAMADHAN Notification Bot. Independent synthetic demonstration; not an official AICTE communication.'].join('\n\n');
 const priority=key.startsWith('verify:')||key.startsWith('reset:')?20:user.role==='complainant'?10:0;
 await tx.query('INSERT INTO email_outbox(id,idempotency_key,user_id,recipient,subject,html,text_body,priority,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(idempotency_key) DO NOTHING',[id('MAIL'),key,user.id,user.email,title,template(title,message,url),text,priority,smtpEnabled()?'pending':'simulated']);
}
export async function notify(tx:any,complaint:Row,eventId:string,eventType:string,message:string,priority='info',publicEvent=true){
 // Include public-safe milestones even when the underlying officer event is internal.
 const fresh=(await tx.query('SELECT current_stage,current_status,current_bureau_id,is_draft FROM complaints WHERE complaint_id=$1',[complaint.complaint_id])).rows[0];
 const current={...complaint,...fresh};
 if(current.is_draft||eventType==='DRAFT_SAVED')return;
 const milestone=publicComplaintUpdate(eventType);
 const users=(await tx.query("SELECT * FROM app_users WHERE active=true AND ((role='complainant' AND verified=true AND complainant_id=$1 AND $5=true) OR (role IN ('so','director') AND bureau_id=$2 AND (region_id IS NULL OR region_id=$3)) OR (role='da' AND officer_id=$4)) ORDER BY CASE WHEN role='complainant' THEN 0 ELSE 1 END,id",[current.complainant_id,current.current_bureau_id,current.region_id,current.dealing_assistant_id,publicEvent||Boolean(milestone)])).rows;
 const configured=(await tx.query("SELECT value FROM system_settings WHERE key='notification_templates'")).rows[0]?.value?.[eventType];
 for(const user of users){
  const owner=user.role==='complainant';
  const safeMessage=owner?(milestone||'An update has been recorded for your complaint. Sign in to view the details available to you.'):message;
  const title=`${eventType.replaceAll('_',' ')} · ${current.complaint_id}`;
  await tx.query('INSERT INTO app_notifications(id,user_id,complaint_id,event_type,title,message,priority) VALUES($1,$2,$3,$4,$5,$6,$7)',[id('NTF'),user.id,current.complaint_id,eventType,title,safeMessage,priority]);
  const render=(text:string)=>text.replaceAll('{{ticket}}',current.complaint_id).replaceAll('{{category}}',current.category_id).replaceAll('{{bureau}}',current.current_bureau_id).replaceAll('{{status}}',current.current_status);
  // Custom officer templates never override the complainant's safe summary.
  const subject=!owner&&configured?.subject?render(configured.subject):`SAMADHAN | Complaint Status Update | ${current.complaint_id}`;
  const body=owner?complaintEmailMessage(user,current,safeMessage):configured?.message?render(configured.message):safeMessage;
  const base=(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,'');
  await queueEmail(tx,user,`${eventId}:${user.id}`,subject,body,`${base}/complaints/${encodeURIComponent(current.complaint_id)}`);
 }
}
export async function processOutbox(limit=20){
 if(!smtpEnabled())return {transport:'simulated',sent:0,failed:0,message:'SMTP delivery is disabled or incomplete. Messages remain in the simulated outbox; no external email was sent.'};
 const conn=await db();
 const {default:nodemailer}=await import('nodemailer');
 const secure=process.env.SMTP_SECURE==='true'||process.env.SMTP_PORT==='465';
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure,requireTLS:!secure,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:7000,greetingTimeout:7000,socketTimeout:10000});
 let sent=0,failed=0;const began=Date.now();
 try{
  await conn.query("UPDATE email_outbox SET status='failed',processing_token=NULL,claimed_at=NULL,next_attempt_at=now(),last_error='Delivery interrupted; previous SMTP acceptance may be unknown.' WHERE status='sending' AND coalesce(claimed_at,created_at)<now()-INTERVAL '15 minutes'");
  for(let index=0;index<Math.min(Math.max(limit,1),100)&&Date.now()-began<20000;index++){
   const lease=id('LEASE');
   const mail=await conn.transaction(async tx=>(await tx.query("UPDATE email_outbox SET status='sending',attempts=attempts+1,claimed_at=now(),processing_token=$1 WHERE id=(SELECT id FROM email_outbox WHERE status IN ('pending','failed') AND next_attempt_at<=now() AND attempts<5 ORDER BY priority DESC,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",[lease])).rows[0]);
   if(!mail)break;
   try{
    const result=await transport.sendMail({from:process.env.SMTP_FROM,to:mail.recipient,subject:mail.subject,html:mail.html,text:mail.text_body||undefined,messageId:`<${mail.id}@samadhan-notifications.local>`});
    if(!result.accepted?.length)throw Object.assign(new Error('Recipient not accepted'),{code:'RECIPIENT_NOT_ACCEPTED'});
    await conn.transaction(async tx=>{
     await tx.query("UPDATE email_outbox SET status='sent',sent_at=now(),provider_message_id=$3,last_error=NULL,claimed_at=NULL,processing_token=NULL WHERE id=$1 AND processing_token=$2",[mail.id,lease,result.messageId]);
     await tx.query("INSERT INTO email_delivery_attempts(id,email_id,status) VALUES($1,$2,'accepted')",[id('ATT'),mail.id]);
    });sent++;
   }catch(error){
    const err=error as {code?:string;responseCode?:number};
    const reason=`SMTP ${String(err.code||'DELIVERY_ERROR').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50)}${err.responseCode?` (${Number(err.responseCode)})`:''}. Delivery was not confirmed.`;
    await conn.transaction(async tx=>{
     await tx.query("UPDATE email_outbox SET status='failed',last_error=$3,next_attempt_at=now()+INTERVAL '1 minute'*power(2,attempts),claimed_at=NULL,processing_token=NULL WHERE id=$1 AND processing_token=$2",[mail.id,lease,reason]);
     await tx.query("INSERT INTO email_delivery_attempts(id,email_id,status,error) VALUES($1,$2,'failed',$3)",[id('ATT'),mail.id,reason]);
    });failed++;
   }
  }
 }finally{transport.close();}
 return {transport:'smtp',sent,failed,note:'Sent means SMTP-provider acceptance, not confirmed inbox placement.'};
}
