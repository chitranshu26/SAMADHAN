import { STAGES, type Row } from '@/types';

// Public-safe summaries: officer remarks and deliberations never appear here.
const updates: Record<string,string> = {
  COMPLAINT_SUBMITTED: 'Your complaint has been received and is awaiting initial scrutiny. Keep your complaint reference to track its progress.',
  AUTO_ROUTED_TO_BUREAU: 'Your complaint has been routed to the assigned demonstration bureau for review.',
  SO_INITIAL_SCRUTINY_COMPLETED: 'Initial scrutiny has been completed. The concerned team will arrange the next step.',
  DA_ASSIGNED: 'A Dealing Assistant has been assigned to handle your complaint.',
  NOTICE_ISSUED: 'A notice has been recorded as issued to the institution. Further updates will appear in your case timeline.',
  INVESTIGATION_STARTED: 'Your complaint has entered Investigation & Compliance. The assigned team is reviewing the case.',
  INSTITUTION_RESPONSE_RECEIVED: 'An institutional response has been recorded and will be reviewed by the assigned team.',
  EVIDENCE_EVALUATION_STARTED: 'Your complaint has entered Evidence Evaluation. The assigned team is assessing the available material.',
  SIGNOFF_REQUESTED: 'Your complaint is Pending Sign-Off. The recommendation has been submitted to the authorized approving officer.',
  RETURNED_FOR_INVESTIGATION: 'Your complaint has been returned for further investigation. A final decision has not yet been recorded.',
  CASE_CLOSED: 'A final decision has been recorded and your complaint is Closed / Disposed. Sign in to read the outcome and view feedback or reopening options.',
  CLARIFICATION_REQUESTED: 'Additional information is required. Sign in to read the request and provide your response.',
  CLARIFICATION_RECEIVED: 'Your additional information has been recorded for the assigned team to review.',
  CASE_ESCALATED: 'Your complaint has been escalated for supervisory attention.',
  SLA_BREACHED: 'Your complaint has passed its configured demonstration deadline and has been escalated for attention.',
  SLA_WARNING: 'Your complaint is approaching its configured demonstration deadline. The responsible team has been notified.',
  BUREAU_TRANSFERRED: 'Your complaint has been transferred to another authorized bureau for scrutiny.',
  REOPENING_REQUESTED: 'Your reopening request has been received for review. The previous outcome remains on record until a decision is made.',
  COMPLAINT_REOPENED: 'Your complaint has been reopened for investigation. Its previous history remains available.',
  FEEDBACK_SUBMITTED: 'Your feedback has been received. Thank you for sharing your experience.',
};

export function publicComplaintUpdate(eventType: string) { return updates[eventType]; }

export function complaintEmailMessage(user: Row, complaint: Row, update: string) {
  const stage=STAGES[Number(complaint.current_stage)-1] || 'Under review';
  const updated=new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date());
  return `Dear ${user.name || 'Complainant'},\n\n${update}\n\nComplaint reference: ${complaint.complaint_id}\nCurrent stage: ${stage}\nAssigned bureau: ${complaint.current_bureau_id}\nUpdate time (IST): ${updated}\n\nSign in to your SAMADHAN account for authorized details and any action required. Sensitive investigation notes and evidence are not included in this email.`;
}
