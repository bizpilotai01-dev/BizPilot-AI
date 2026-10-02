"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { DashboardSummary, Lead, LeadStatus, Task } from "@/lib/types";
import { daysSince } from "@/lib/lead-insight";
import { authorizedFetch } from "@/lib/supabase-browser";
import { CurrencyAmount } from "./_components/currency-amount";
import { AccountMenu } from "./_components/account-menu";
import { BusinessOnboardingForm } from "./_components/business-onboarding-form";
import { DashboardHeader, type ThemeMode } from "./_components/dashboard-header";
import { LeadCreationForm } from "./_components/lead-creation-form";
import { PipelineTable } from "./_components/pipeline-table";
import { statusLabels } from "./_components/status-select";
import { SupportingActivity } from "./_components/supporting-activity";

const emptySummary: DashboardSummary = {
  totalLeads: 0,
  newLeads: 0,
  qualifiedLeads: 0,
  wonLeads: 0,
  pipelineValue: 0,
  followUpsDue: 0,
  conversionRate: 0,
  recentActivities: [],
};

const themeEvent = "bizpilot-theme-change";
let volatileTheme: ThemeMode | null = null;

// Portfolio-level queue. Individual recommendations come from /api/ai/insight,
// which reads that lead's real notes, tasks, and contact history. This only
// picks which leads deserve attention first.
function buildAiSuggestions(leads: Lead[]) {
  if (!leads.length) {
    return [
      {
        title: "Add your first lead",
        detail: "Create a lead record to unlock AI follow-up recommendations and pipeline guidance.",
      },
    ];
  }

  const now = Date.now();
  const open = leads.filter((lead) => lead.status !== "won" && lead.status !== "lost");
  const scored = open.map((lead) => {
    const idleDays = daysSince(lead.lastContactAt, new Date(now)) ?? 0;
    const neverContacted = !lead.lastContactAt;
    const staleness = neverContacted ? 21 : Math.min(idleDays, 21);
    const stageWeight = { proposal: 3, qualified: 2, contacted: 1, new: 1, won: 0, lost: 0 }[lead.status] ?? 0;
    const valueWeight = Number(lead.value ?? 0) > 0 ? 2 : 0;
    return { lead, score: staleness + stageWeight + valueWeight, idleDays, neverContacted };
  });

  const priority = scored.sort((left, right) => right.score - left.score)[0];
  const suggestions: Array<{ title: string; detail: string }> = [];

  if (priority) {
    const { lead, idleDays, neverContacted } = priority;
    const stageWord = lead.status === "proposal" ? "awaiting a decision" : `in the ${lead.status} stage`;
    const silence = neverContacted ? "no contact has been logged yet" : `last contacted ${idleDays} ${idleDays === 1 ? "day" : "days"} ago`;
    suggestions.push({
      title: `Work ${lead.name} next`,
      detail: `${lead.company} is ${stageWord} and ${silence}. This is the most time-sensitive open opportunity, so start here.`,
    });
  }

  const slipping = open.filter((lead) => {
    const idleDays = daysSince(lead.lastContactAt, new Date(now));
    return lead.id !== priority?.lead.id && idleDays !== null && idleDays >= 7;
  });
  if (slipping.length) {
    const names = slipping.slice(0, 3).map((lead) => lead.name).join(", ");
    const extra = slipping.length > 3 ? ` and ${slipping.length - 3} more` : "";
    suggestions.push({
      title: `${slipping.length} lead${slipping.length === 1 ? " has" : "s have"} gone quiet`,
      detail: `${names}${extra} ${slipping.length === 1 ? "has" : "have"} had no logged contact in a week or more. A short re-engagement note is usually cheaper than winning the lead back later.`,
    });
  }

  const awaitingDecision = open.filter((lead) => lead.status === "proposal");
  if (awaitingDecision.length) {
    const names = awaitingDecision.slice(0, 3).map((lead) => lead.name).join(", ");
    suggestions.push({
      title: `Close out ${awaitingDecision.length} proposal${awaitingDecision.length === 1 ? "" : "s"}`,
      detail: `${names} ${awaitingDecision.length === 1 ? "is" : "are"} past the proposal stage with no decision logged. Ask for a decision date rather than another open-ended follow-up.`,
    });
  }

  const hotLeads = open.filter((lead) => ["new", "contacted", "qualified"].includes(lead.status));
  if (hotLeads.length >= 3) {
    suggestions.push({
      title: "Keep early momentum moving",
      detail: `${open.filter((lead) => lead.status === "new").length} new and ${open.filter((lead) => lead.status === "qualified").length} qualified opportunities are live. Open each lead record to read its generated next best action before writing anything new.`,
    });
  }

  if (suggestions.length < 3 && open.length > suggestions.length) {
    suggestions.push({
      title: `Review ${open.length - suggestions.length} other open leads`,
      detail: `${open.length} opportunities are still open in total. Each lead record carries its own summary and recommended next step so you can triage them in order.`,
    });
  }

  return suggestions.slice(0, 3);
}

function getThemeSnapshot(): ThemeMode {
  try {
    const savedTheme = window.localStorage.getItem("bizpilot-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  } catch {
    if (volatileTheme) return volatileTheme;
  }
  if (volatileTheme) return volatileTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getThemeServerSnapshot(): ThemeMode {
  return "light";
}

function subscribeToTheme(onChange: () => void) {
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onChange);
  window.addEventListener(themeEvent, onChange);
  colorScheme.addEventListener("change", onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(themeEvent, onChange);
    colorScheme.removeEventListener("change", onChange);
  };
}

function saveTheme(theme: ThemeMode) {
  volatileTheme = theme;
  try {
    window.localStorage.setItem("bizpilot-theme", theme);
  } catch {
    // Keep the selected theme for this session when storage is unavailable.
  }
  window.dispatchEvent(new Event(themeEvent));
}

async function fetchDashboardData(filters: { query?: string; status?: LeadStatus | "all" } = {}) {
  const leadsSearch = new URLSearchParams();
  if (filters.query?.trim()) leadsSearch.set("q", filters.query.trim());
  if (filters.status && filters.status !== "all") leadsSearch.set("status", filters.status);

  const responses = await Promise.all([
    authorizedFetch("/api/dashboard"),
    authorizedFetch(`/api/leads${leadsSearch.size ? `?${leadsSearch}` : ""}`),
    authorizedFetch("/api/tasks"),
  ]);
  if (responses.some((response) => !response.ok)) {
    throw new Error("The dashboard could not retrieve the latest records.");
  }

  const [dashboard, leadPayload, taskPayload] = await Promise.all(
    responses.map((response) => response.json()),
  ) as [DashboardSummary, { items?: Lead[] }, { items?: Task[] }];

  if (!Array.isArray(leadPayload.items) || !Array.isArray(taskPayload.items)) {
    throw new Error("The dashboard received an unexpected response. Try again.");
  }

  return { dashboard, leads: leadPayload.items, tasks: taskPayload.items };
}

export default function DashboardClient() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getThemeServerSnapshot);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pendingLeadIds, setPendingLeadIds] = useState<string[]>([]);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [statusError, setStatusError] = useState("");
  const [leadQuery, setLeadQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [taskForm, setTaskForm] = useState({ leadId: "", title: "", dueDate: "" });
  const [taskError, setTaskError] = useState("");
  const [taskSuccess, setTaskSuccess] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const leadNameRef = useRef<HTMLInputElement>(null);
  const aiSuggestions = useMemo(() => buildAiSuggestions(leads), [leads]);
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0] ?? null;
  const taskLeadId = leads.some((lead) => lead.id === taskForm.leadId)
    ? taskForm.leadId
    : leads[0]?.id ?? "";

  const refreshData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const data = await fetchDashboardData({ query: leadQuery, status: statusFilter });
      setSummary(data.dashboard);
      setLeads(data.leads);
      setTasks(data.tasks);
    } catch (requestError) {
      setLoadError(requestError instanceof Error ? requestError.message : "The dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [leadQuery, statusFilter]);

  const refreshSummary = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/dashboard");
      if (!response.ok) return;
      setSummary((await response.json()) as DashboardSummary);
    } catch {
      // Keep the previous summary when the metrics refresh fails.
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const data = await fetchDashboardData();
        if (!active) return;
        setSummary(data.dashboard);
        setLeads(data.leads);
        setTasks(data.tasks);
      } catch (requestError) {
        if (!active) return;
        setLoadError(requestError instanceof Error ? requestError.message : "The dashboard could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const refreshOnAuthChange = () => {
      void refreshData();
    };

    window.addEventListener("bizpilot-auth-change", refreshOnAuthChange);
    return () => window.removeEventListener("bizpilot-auth-change", refreshOnAuthChange);
  }, [refreshData]);

  const searchFiltersActive = leadQuery.trim().length > 0 || statusFilter !== "all";

  const refetchFilteredLeads = useCallback(async () => {
    try {
      const response = await fetchDashboardData({ query: leadQuery, status: statusFilter });
      setSummary(response.dashboard);
      setLeads(response.leads);
      setTasks(response.tasks);
      setLoadError("");
    } catch (requestError) {
      setLoadError(requestError instanceof Error ? requestError.message : "The dashboard could not be loaded.");
    }
  }, [leadQuery, statusFilter]);

  useEffect(() => {
    if (!searchFiltersActive) return;

    const timer = setTimeout(() => {
      void refetchFilteredLeads();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchFiltersActive, refetchFilteredLeads]);

  const handleClearFilters = useCallback(() => {
    setLeadQuery("");
    setStatusFilter("all");
  }, []);

  const countMetrics = [
    { label: "Total leads", value: summary.totalLeads },
    { label: "New leads", value: summary.newLeads },
    { label: "Qualified", value: summary.qualifiedLeads },
    { label: "Won", value: summary.wonLeads },
    { label: "Follow-ups due", value: summary.followUpsDue },
    { label: "Conversion", value: summary.conversionRate, suffix: "%" },
  ];

  async function updateLeadStatus(leadId: string, next: LeadStatus) {
    const previous = leads.find((lead) => lead.id === leadId);
    if (!previous || previous.status === next) return;

    setPendingLeadIds((current) => [...current, leadId]);
    setStatusError("");
    setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status: next } : lead)));

    try {
      const response = await authorizedFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "This status change could not be saved.");
      }

      if (payload.item) {
        const saved = payload.item as Lead;
        setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, ...saved } : lead)));
      }
      if (payload.warning) setStatusError(payload.warning);

      await refreshSummary();
    } catch (updateError) {
      setLeads((current) => current.map((lead) => (lead.id === leadId ? previous : lead)));
      setStatusError(
        updateError instanceof Error
          ? `${previous.name} stayed on ${statusLabels[previous.status]}. ${updateError.message}`
          : `${previous.name} could not be updated.`,
      );
    } finally {
      setPendingLeadIds((current) => current.filter((item) => item !== leadId));
    }
  }

  async function updateTaskStatus(taskId: string, next: Task["status"]) {
    const previous = tasks.find((task) => task.id === taskId);
    if (!previous || previous.status === next) return;

    setPendingTaskIds((current) => [...current, taskId]);
    setTaskError("");
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: next } : task)));

    try {
      const response = await authorizedFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Task status could not be saved.");
      }

      if (payload.item) {
        setTasks((current) => current.map((task) => (task.id === taskId ? payload.item as Task : task)));
      }
      if (payload.warning) setTaskError(payload.warning);
      await refreshSummary();
    } catch (requestError) {
      setTasks((current) => current.map((task) => (task.id === taskId ? previous : task)));
      setTaskError(requestError instanceof Error ? requestError.message : "Task status could not be saved.");
    } finally {
      setPendingTaskIds((current) => current.filter((item) => item !== taskId));
    }
  }

  function focusLeadForm() {
    leadNameRef.current?.focus();
  }

  async function generateLeadDraft() {
    if (!selectedLead) {
      setAiDraft("Add a lead first so BizPilot can suggest a follow-up message.");
      return;
    }

    try {
      const response = await authorizedFetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: selectedLead.name,
          company: selectedLead.company,
          status: selectedLead.status,
          value: selectedLead.value,
          owner: "Fidelix",
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "The draft could not be generated.");
      }

      setAiDraft(payload.draft ?? "");
    } catch {
      const statusTone =
        selectedLead.status === "new"
          ? "introduce your solution and ask a quick qualification question"
          : selectedLead.status === "contacted"
            ? "check in and reaffirm the value of your service"
            : selectedLead.status === "qualified"
              ? "move toward a clear next step and scheduling"
              : selectedLead.status === "proposal"
                ? "confirm the proposal and close the final gap"
                : "celebrate the progress and plan the next milestone";

      const valueLabel = new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 0,
      }).format(selectedLead.value || 0);

      setAiDraft(
        `Hi ${selectedLead.name},\n\nI hope you're doing well. I wanted to follow up on ${selectedLead.company} and keep momentum moving on the opportunity. Based on your current needs, the best next step is to ${statusTone}.\n\nI believe we can create real value here and keep the process simple, practical, and focused on the outcomes you care about. If this is still a fit, I’d recommend we schedule a brief call and review the next step together.\n\nThe opportunity is currently valued at ${valueLabel}, and I’d be glad to walk you through the plan in a short, actionable conversation.\n\nBest regards,\nFidelix\nBizPilot AI`,
      );
    }
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!taskLeadId || !taskForm.title || !taskForm.dueDate) {
      setTaskError("Select a lead, add a task title, and choose a due date.");
      return;
    }

    setTaskSubmitting(true);
    setTaskError("");
    setTaskSuccess("");

    try {
      const response = await authorizedFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: taskLeadId,
          title: taskForm.title,
          dueDate: taskForm.dueDate,
          status: "pending",
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "The task could not be created.");
      }

      setTaskForm({ leadId: taskLeadId, title: "", dueDate: "" });
      setTaskSuccess(
        payload.warning
          ? `${payload.item.title} was added. ${payload.warning}`
          : `${payload.item.title} was added to the task list.`,
      );
      await refreshData();
    } catch (requestError) {
      setTaskError(requestError instanceof Error ? requestError.message : "The task could not be created.");
    } finally {
      setTaskSubmitting(false);
    }
  }

  return (
    <div className="app-shell min-h-screen transition-colors duration-200 motion-reduce:transition-none" data-theme={theme}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <DashboardHeader theme={theme} onThemeChange={saveTheme} onAddLead={focusLeadForm} accountMenu={<AccountMenu />} />

      <main id="main-content" className="mx-auto max-w-[1280px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <section aria-label="Pipeline summary" className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">Business snapshot</h2>
            <p className="text-sm text-secondary">Current pipeline position</p>
          </div>

          <div className="snapshot-layout grid gap-px overflow-hidden rounded-lg border border-subtle bg-[var(--border-subtle)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="metric-panel metric-panel-lead min-w-0 bg-[var(--page-background)]">
              <p className="text-[13px] font-medium leading-tight text-secondary">Pipeline value</p>
              <p className="mt-2 whitespace-nowrap text-3xl font-semibold leading-none tabular-nums sm:text-4xl">
                {loading || loadError ? "—" : <CurrencyAmount amount={summary.pipelineValue} />}
              </p>
              <p className="mt-2 text-xs text-muted">Open opportunities only</p>
            </div>

            <div className="metric-grid grid grid-cols-2 sm:grid-cols-3">
              {countMetrics.map((metric) => (
                <div key={metric.label} className="metric-panel min-w-0 bg-[var(--page-background)]">
                  <p className="text-[13px] font-medium leading-tight text-secondary">{metric.label}</p>
                  <p className="mt-2 whitespace-nowrap text-2xl font-semibold leading-none tabular-nums sm:text-3xl">
                    {loading || loadError ? "—" : `${metric.value}${metric.suffix ?? ""}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
          <div className="min-w-0">
            {statusError && (
          <p className="feedback-message feedback-error mb-4" role="alert">
            <svg aria-hidden="true" className="feedback-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5h.01" />
            </svg>
            <span>{statusError}</span>
          </p>
        )}

            <PipelineTable
              leads={leads}
              loading={loading}
              error={loadError}
              onRetry={() => void refreshData()}
              onAddLead={focusLeadForm}
              onStatusChange={(leadId, next) => void updateLeadStatus(leadId, next)}
              pendingLeadIds={pendingLeadIds}
              totalLeads={summary.totalLeads}
              query={leadQuery}
              onQueryChange={setLeadQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onClearFilters={handleClearFilters}
            />
            {taskError && (
              <p className="feedback-message feedback-error mt-4" role="alert">
                <span>{taskError}</span>
              </p>
            )}
            <SupportingActivity
              tasks={tasks}
              activities={summary.recentActivities}
              loading={loading}
              error={loadError}
              pendingTaskIds={pendingTaskIds}
              onTaskStatusChange={(taskId, nextStatus) => void updateTaskStatus(taskId, nextStatus)}
            />
          </div>

          <aside className="min-w-0 lg:sticky lg:top-6">
            <div className="panel-surface">
              <h2 className="section-heading">Quick actions</h2>
              <p className="mt-1 text-sm leading-relaxed text-secondary">Capture a lead or set up your business profile.</p>
            </div>
            <div className="mt-4 space-y-4">
              <div className="panel-surface">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="section-heading">AI recommendations</h2>
                  <span className="rounded-full border border-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
                    Live
                  </span>
                </div>
                <ul className="mt-4 space-y-3">
                  {aiSuggestions.map((suggestion) => (
                    <li key={suggestion.title} className="rounded-md border border-subtle bg-[var(--surface-subtle)] p-3">
                      <p className="text-sm font-semibold">{suggestion.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-secondary">{suggestion.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="module-surface">
                <h2 className="section-heading">AI follow-up draft</h2>
                <p className="mt-1 text-sm leading-relaxed text-secondary">Turn a lead into a ready-to-send follow-up message.</p>

                <div className="mt-4">
                  <label className="form-label" htmlFor="ai-lead-select">Lead</label>
                  <select
                    id="ai-lead-select"
                    className="form-control"
                    value={selectedLead?.id ?? ""}
                    onChange={(event) => setSelectedLeadId(event.target.value)}
                    disabled={!leads.length}
                  >
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.name}</option>
                    ))}
                  </select>
                </div>

                <button type="button" className="button-primary mt-4 min-h-11 w-full px-4 text-sm" onClick={generateLeadDraft}>
                  Generate draft
                </button>

                {aiDraft && (
                  <div className="mt-4">
                    <label className="form-label" htmlFor="ai-draft-output">Draft</label>
                    <textarea
                      id="ai-draft-output"
                      className="form-control min-h-[180px] resize-y"
                      readOnly
                      value={aiDraft}
                    />
                  </div>
                )}
              </div>
              <section aria-labelledby="task-form-heading" className="module-surface">
                <h2 id="task-form-heading" className="section-heading">Create a follow-up task</h2>
                <p className="mt-1 text-sm leading-relaxed text-secondary">Schedule the next action for a lead.</p>

                <form onSubmit={handleTaskSubmit} className="mt-4 space-y-3">
                  <div>
                    <label className="form-label" htmlFor="task-lead-select">Lead</label>
                    <select
                      id="task-lead-select"
                      className="form-control"
                      value={taskLeadId}
                      onChange={(event) => setTaskForm((current) => ({ ...current, leadId: event.target.value }))}
                      disabled={!leads.length}
                    >
                      {leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>{lead.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" htmlFor="task-title">Task title</label>
                    <input
                      id="task-title"
                      className="form-control"
                      value={taskForm.title}
                      onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Schedule discovery call"
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label" htmlFor="task-date">Due date</label>
                    <input
                      id="task-date"
                      className="form-control"
                      type="date"
                      value={taskForm.dueDate}
                      onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
                      required
                    />
                  </div>

                  {taskError && (
                    <p className="feedback-message feedback-error" role="alert">
                      <svg aria-hidden="true" className="feedback-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v5M12 16.5h.01" />
                      </svg>
                      <span>{taskError}</span>
                    </p>
                  )}

                  {taskSuccess && (
                    <p className="feedback-message feedback-success" role="status">
                      <svg aria-hidden="true" className="feedback-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                      </svg>
                      <span>{taskSuccess}</span>
                    </p>
                  )}

                  <button type="submit" className="button-primary min-h-11 w-full px-4 text-sm" disabled={taskSubmitting}>
                    {taskSubmitting ? "Saving task..." : "Add task"}
                  </button>
                </form>
              </section>
              <LeadCreationForm onCreated={refreshData} inputRef={(node) => { leadNameRef.current = node; }} />
              <BusinessOnboardingForm />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
