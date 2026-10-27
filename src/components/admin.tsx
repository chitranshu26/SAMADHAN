"use client";

import { Database, ShieldCheck, Users } from "lucide-react";
import { Badge, PageTitle, Panel } from "./ui";

export function Admin({ bootstrap }: { bootstrap: Record<string, any> }) {
  const user = bootstrap?.user ?? {};

  return (
    <>
      <PageTitle
        eyebrow="SYSTEM OPERATIONS · CONTROL CENTER"
        title="Administration"
        description="Review live demo configuration and governance controls for the SAMADHAN workspace."
      />

      <div className="metrics-grid three">
        <div className="metric-card">
          <div className="metric-label"><Users size={15} />Operators</div>
          <strong className="metric-value">{bootstrap?.stats?.operators ?? 6}</strong>
          <p>Active roles in the demonstration model</p>
        </div>
        <div className="metric-card">
          <div className="metric-label"><Database size={15} />Database</div>
          <strong className="metric-value">Connected</strong>
          <p>Demo state is synchronized in the project database</p>
        </div>
        <div className="metric-card">
          <div className="metric-label"><ShieldCheck size={15} />Policy</div>
          <strong className="metric-value">Protected</strong>
          <p>Role boundaries remain enforced in the secure demo flow</p>
        </div>
      </div>

      <Panel title="Account & governance overview" subtitle={`Signed in as ${user.name || "Administrator"}`}>
        <div className="data-table">
          <div className="table-row">
            <span>Role</span>
            <strong>{user.role || "admin"}</strong>
          </div>
          <div className="table-row">
            <span>Workspace mode</span>
            <Badge tone="green">Demonstration</Badge>
          </div>
          <div className="table-row">
            <span>System status</span>
            <Badge tone="blue">Operational</Badge>
          </div>
        </div>
      </Panel>
    </>
  );
}
