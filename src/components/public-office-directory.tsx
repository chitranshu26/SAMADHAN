"use client";
import { useState } from "react";
import { ArrowUpRight, MapPin, Network } from "lucide-react";
const offices=[
  {region:"Central",city:"Bhopal",code:"CRO"},
  {region:"Eastern",city:"Kolkata",code:"ERO"},
  {region:"Northern",city:"Kanpur",code:"NRO"},
  {region:"North-West",city:"Chandigarh",code:"NWRO"},
  {region:"Southern",city:"Chennai",code:"SRO"},
  {region:"South Central",city:"Hyderabad",code:"SCRO"},
  {region:"South-West",city:"Bengaluru",code:"SWRO"},
  {region:"Western",city:"Mumbai",code:"WRO"},
];
export function OfficeDirectory(){
  const [selected,setSelected]=useState(0);const office=offices[selected];
  return <section className="office-directory"><div className="office-network-panel"><div className="eyebrow">INDIA · PUBLISHED OFFICE NETWORK</div><h2>Choose a region.<br/>Explore its reference.</h2><p>Interactive directory based on AICTE’s 2022–23 handbook, not a live operational listing.</p><div className="office-network" aria-label="Documented regional offices">{offices.map((item,i)=><button key={item.code} className={selected===i?"selected":""} onClick={()=>setSelected(i)} aria-pressed={selected===i}><span className="office-node"/><b>{item.code}</b><span>{item.city}</span></button>)}</div><small>Directory illustration · Not a geographical map or jurisdiction boundary.</small></div><div className="office-detail" aria-live="polite"><Network size={36}/><span className="reference-badge">PUBLISHED REFERENCE · 2022–23</span><h2>{office.region}<br/>Regional Office</h2><div className="office-city"><MapPin size={22}/>{office.city}</div><p>This office and city are documented in Appendix 14 of AICTE’s Approval Process Handbook 2022–23. Current operations and contact details require confirmation from AICTE.</p><a href="https://www.aicte.gov.in/sites/default/files/Approval%20Process%20Handbook2022-23.pdf" target="_blank" rel="noopener noreferrer" className="source-link">Read the official source <ArrowUpRight size={16}/></a><a href="https://www.aicte-india.org/" target="_blank" rel="noopener noreferrer" className="source-link">Visit AICTE for current details <ArrowUpRight size={16}/></a></div></section>;
}
