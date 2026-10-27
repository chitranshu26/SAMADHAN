export type Role = 'complainant'|'so'|'da'|'director'|'chairman'|'admin';
export type Row = Record<string, any>;
export interface User { id:string; email:string; name:string; role:Role; designation:string; bureau_id:string|null; region_id:string|null; officer_id:string|null; complainant_id:string|null; verified:boolean; active:boolean }
export const STAGES = ['Initial Scrutiny','Notice Issued','Investigation & Compliance','Evidence Evaluation','Pending Sign-Off','Closed / Disposed'];
