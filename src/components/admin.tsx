"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Database,
  ShieldCheck,
  Users,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

import {
  api,
  Badge,
  Button,
  PageTitle,
  Panel,
  date,
} from "./ui";

import { useToast } from "./providers";

// Registered user structure
type RegisteredUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  verified: boolean;
  active: boolean;
  created_at?: string;
};

type AdminResponse = {
  users: RegisteredUser[];
};

export function Admin({
  bootstrap,
}: {
  bootstrap: Record<string, any>;
}) {
  const user = bootstrap?.user ?? {};

  const toast = useToast();

  const [processingId, setProcessingId] = useState<string | null>(
    null
  );

  // Fetch registered users from Admin API
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<AdminResponse>({
    queryKey: ["admin", "registration-approvals"],

    queryFn: () =>
      api<AdminResponse>("/api/admin"),

    refetchInterval: 15000,
  });

  // Filter users waiting for approval
  const pendingUsers = (data?.users ?? []).filter(
    (account) =>
      account.role === "complainant" &&
      account.verified === false &&
      account.active === true
  );

  // Approve or reject a registered user
  async function decideRegistration(
    account: RegisteredUser,
    decision: "approve" | "reject"
  ) {
    if (processingId !== null) return;

    let reason = "";

    if (decision === "approve") {
      const confirmed = window.confirm(
        `Approve the registration of ${account.name} (${account.email})?`
      );

      if (!confirmed) return;
    }

    if (decision === "reject") {
      const enteredReason = window.prompt(
        `Enter the reason for rejecting ${account.name}:`
      );

      if (enteredReason === null) return;

      reason = enteredReason.trim();

      if (reason.length < 5) {
        toast(
          "Rejection reason must contain at least 5 characters.",
          true
        );
        return;
      }

      if (reason.length > 500) {
        toast(
          "Rejection reason cannot exceed 500 characters.",
          true
        );
        return;
      }
    }

    setProcessingId(account.id);

    try {
      await api("/api/admin", {
        action: "registration_decide",
        id: account.id,
        decision,
        reason,
      });

      toast(
        decision === "approve"
          ? `${account.name} approved successfully.`
          : `${account.name}'s registration rejected.`
      );

      // Refresh the list
      await refetch();
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "Unable to process registration.",
        true
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <>
      {/* ORIGINAL ADMINISTRATOR HEADER */}

      <PageTitle
        eyebrow="SYSTEM OPERATIONS · CONTROL CENTER"
        title="Administration"
        description="Review live demo configuration and governance controls for the SAMADHAN workspace."
      />

      {/* ORIGINAL DASHBOARD METRICS */}

      <div className="metrics-grid three">
        <div className="metric-card">
          <div className="metric-label">
            <Users size={15} />
            Operators
          </div>

          <strong className="metric-value">
            {bootstrap?.stats?.operators ?? 6}
          </strong>

          <p>
            Active roles in the demonstration model
          </p>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <Database size={15} />
            Database
          </div>

          <strong className="metric-value">
            Connected
          </strong>

          <p>
            Demo state is synchronized in the project database
          </p>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <ShieldCheck size={15} />
            Policy
          </div>

          <strong className="metric-value">
            Protected
          </strong>

          <p>
            Role boundaries remain enforced in the secure demo flow
          </p>
        </div>
      </div>

      {/* ========================================= */}
      {/* NEW: USER REGISTRATION APPROVAL SECTION */}
      {/* ========================================= */}

      <Panel
        title={`Pending User Approvals (${pendingUsers.length})`}
        subtitle="Review new user registrations before granting account access."
        action={
          <Button
            variant="secondary"
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        }
      >
        {/* Loading */}

        {isLoading && (
          <p>Loading pending registrations...</p>
        )}

        {/* Error */}

        {!isLoading && error && (
          <div>
            <p style={{ color: "var(--red, #dc2626)" }}>
              {error instanceof Error
                ? error.message
                : "Unable to load registered users."}
            </p>

            <Button
              variant="secondary"
              onClick={() => {
                void refetch();
              }}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* No pending users */}

        {!isLoading &&
          !error &&
          pendingUsers.length === 0 && (
            <div style={{ padding: "20px 0" }}>
              <CheckCircle2
                size={26}
                style={{ marginBottom: 10 }}
              />

              <h3>No Pending Registrations</h3>

              <p>
                Newly registered accounts awaiting administrator
                approval will appear here.
              </p>
            </div>
          )}

        {/* Pending users */}

        {!isLoading &&
          !error &&
          pendingUsers.length > 0 && (
            <div className="data-table">
              {pendingUsers.map((account) => (
                <div
                  key={account.id}
                  className="table-row"
                >
                  {/* User details */}

                  <div>
                    <strong>{account.name}</strong>

                    <p>{account.email}</p>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 8,
                      }}
                    >
                      <Badge tone="amber">
                        Pending Approval
                      </Badge>

                      {account.created_at && (
                        <span style={{ fontSize: 12 }}>
                          Registered:{" "}
                          {date(account.created_at, true)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Approval buttons */}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <Button
                      variant="primary"
                      loading={processingId === account.id}
                      disabled={processingId !== null}
                      onClick={() => {
                        void decideRegistration(
                          account,
                          "approve"
                        );
                      }}
                    >
                      <CheckCircle2 size={16} />
                      Approve
                    </Button>

                    <Button
                      variant="danger"
                      disabled={processingId !== null}
                      onClick={() => {
                        void decideRegistration(
                          account,
                          "reject"
                        );
                      }}
                    >
                      <XCircle size={16} />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </Panel>

      {/* ========================================= */}
      {/* ORIGINAL ACCOUNT & GOVERNANCE SECTION */}
      {/* ========================================= */}

      <Panel
        title="Account & governance overview"
        subtitle={`Signed in as ${user.name || "Administrator"}`}
      >
        <div className="data-table">
          <div className="table-row">
            <span>Role</span>

            <strong>{user.role || "admin"}</strong>
          </div>

          <div className="table-row">
            <span>Workspace mode</span>

            <Badge tone="green">
              Demonstration
            </Badge>
          </div>

          <div className="table-row">
            <span>System status</span>

            <Badge tone="blue">
              Operational
            </Badge>
          </div>
        </div>
      </Panel>
    </>
  );
}