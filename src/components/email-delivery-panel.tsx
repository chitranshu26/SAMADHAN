"use client";
import { useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { api, Badge, Button, Panel, date, type Row } from "./ui";
import { useToast } from "./providers";

export function EmailDeliveryPanel({rows=[],status,onRefresh}:{rows?:Row[];status?:string;onRefresh:()=>unknown}) {
  const [busy,setBusy]=useState<string|null>(null);
  const toast=useToast();
  const retry=async(id:string)=>{
    setBusy(id);
    try {
      const result=await api('/api/admin',{action:'retry_email',id});
      if(result.failed) toast('The delivery attempt failed. See the recorded error and SMTP configuration.',true);
      else toast('Delivery processing completed. Check the message status for provider acceptance.');
      await onRefresh();
    } catch(error) { toast(error instanceof Error?error.message:'Unable to retry email.',true); }
    finally { setBusy(null); }
  };
  return <Panel title="Complaint email delivery" subtitle={status || 'Loading transport status'} action={<Button variant="ghost" onClick={()=>onRefresh()}><RefreshCw size={15}/>Refresh</Button>}>
    <p style={{marginBottom:18,lineHeight:1.75}}>Complainants receive submission and stage updates at their registered email. “Accepted” means the SMTP provider accepted the message; inbox placement is not confirmed. “Simulated” means no external email was sent.</p>
    {!rows.length?<p>No emails have been queued yet.</p>:<div className="table-wrap"><table className="case-table"><thead><tr><th>Recipient / message</th><th>Delivery</th><th>Attempts</th><th>Created</th><th>Action</th></tr></thead><tbody>{rows.slice(0,30).map(mail=><tr key={mail.id}><td><strong>{mail.recipient}</strong><div>{mail.subject}</div>{mail.last_error&&<small style={{color:'var(--red)'}}>{mail.last_error}</small>}</td><td><Badge tone={mail.status==='sent'?'green':mail.status==='failed'?'red':mail.status==='simulated'?'neutral':'amber'}>{mail.status==='sent'?'Accepted by SMTP':mail.status}</Badge>{mail.sent_at&&<small style={{display:'block'}}>{date(mail.sent_at,true)} IST</small>}</td><td>{mail.attempts}</td><td>{date(mail.created_at,true)} IST</td><td>{['failed','simulated'].includes(mail.status)&&<Button variant="secondary" disabled={busy!==null} loading={busy===mail.id} onClick={()=>retry(mail.id)}><Mail size={14}/>{mail.status==='simulated'?'Send queued email':'Retry'}</Button>}</td></tr>)}</tbody></table></div>}
  </Panel>;
}
