"use client";

import { useState } from "react";

import type { InactiveLeadAlert } from "@/lib/types";
import { CurrencyAmount } from "./currency-amount";
import { statusLabels } from "./status-select";

type InactiveLeadAlertsProps = {
  alerts: InactiveLeadAlert[];
  thresholdDays: number;
  loading: boolean;
  onThresholdChange: (days: number) => void;
  thresholdSaving: boolean;
  thresholdError: string;
};

const thresholdOptions = [3, 7, 14, 21, 30];

export function InactiveLeadAlerts({
  alerts,
  thresholdDays,
  loading,
  onThresholdChange,
  thresholdSaving,
  thresholdError,
}: InactiveLeadAlertsProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? alerts : alerts.slice(0, 3);
  const hidden = alerts.length - visible.length;

  return (
    <section aria-labelledby="inactive-heading" className="module-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="inactive-heading" className="section-heading">Inactive lead alerts</h2>
          <p className="mt-1 text-sm leading-relaxed text-secondary">
            Open opportunities with no logged contact inside your alert window.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {alerts.length > 0 && (
            <span className="count-badge" role="status" aria-live="polite">
              {alerts.length} {alerts.length === 1 ? "lead" : "leads"}
            </span>
          )}
          <div>
            <label className="sr-only" htmlFor="inactive-threshold">Alert after</label>
            <select
              id="inactive-threshold"
              className="status-select-input"
              value={thresholdDays}
              onChange={(event) => onThresholdChange(Number(event.target.value))}
              disabled={thresholdSaving}
            >
              {thresholdOptions.map((option) => (
                <option key={option} value={option}>
                  {option} {option === 1 ? "day" : "days"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {thresholdError && (
        <p className="feedback-message feedback-error mt-3" role="alert">{thresholdError}</p>
      )}

      {loading && alerts.length === 0 ? (
        <p className="mt-4 text-sm text-secondary" role="status">Checking lead activity...</p>
      ) : alerts.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-secondary">
          Nothing needs chasing. Every open lead has had contact in the last {thresholdDays} days.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {visible.map((alert) => (
              <li key={alert.id} className="inactive-alert-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/lead/${alert.id}`} className="text-sm font-semibold underline-offset-2 hover:underline">
                      {alert.name}
                    </a>
                    <span className="count-badge">{statusLabels[alert.status]}</span>
                    {alert.severity === "critical" && (
                      <span className="count-badge inactive-alert-critical">
                        {alert.idleDays}d quiet
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-secondary">{alert.reason}</p>
                </div>
                <div className="shrink-0 text-right">
                  {alert.value > 0 ? (
                    <CurrencyAmount amount={alert.value} />
                  ) : (
                    <span className="text-sm text-secondary">No value</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {hidden > 0 || expanded ? (
            <button
              type="button"
              className="button-secondary mt-4 min-h-11 px-4 text-sm"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show fewer" : `Show ${hidden} more`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
