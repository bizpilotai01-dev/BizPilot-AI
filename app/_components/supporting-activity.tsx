import type { DashboardSummary, Task } from "@/lib/types";

type SupportingActivityProps = {
  tasks: Task[];
  activities: DashboardSummary["recentActivities"];
  loading: boolean;
  error: string;
  pendingTaskIds: string[];
  onTaskStatusChange: (taskId: string, status: Task["status"]) => void;
};

function parseDueDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDueDate(value: string) {
  const date = parseDueDate(value);
  return date
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)
    : value;
}

function daysFromToday(value: string) {
  const date = parseDueDate(value);
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

function describeDueDate(value: string) {
  const days = daysFromToday(value);
  if (days === null) return "No due date";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "Due yesterday";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `Due in ${days} days`;
}

function isOverdue(value: string) {
  const days = daysFromToday(value);
  return days !== null && days < 0;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SupportingActivity({
  tasks,
  activities,
  loading,
  error,
  pendingTaskIds,
  onTaskStatusChange,
}: SupportingActivityProps) {
  const openTasks = tasks.filter((task) => task.status === "pending");
  const overdueCount = openTasks.filter((task) => isOverdue(task.dueDate)).length;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="tasks-heading" className="panel-surface flex min-w-0 flex-col">
        <div className="panel-header">
          <div>
            <h2 id="tasks-heading" className="section-heading">Follow-up tasks</h2>
            <p className="mt-1 text-xs text-secondary">Daily reminders for tasks due tomorrow and overdue.</p>
          </div>
          {!loading && !error && (
            <span className={`count-badge ${overdueCount ? "task-overdue-badge" : ""}`}>
              {overdueCount ? `${overdueCount} overdue` : `${openTasks.length} open`}
            </span>
          )}
        </div>

        {loading ? (
          <ul className="mt-4 space-y-2" role="status" aria-label="Loading tasks">
            {[0, 1, 2].map((row) => (
              <li key={row} className="flex items-center gap-3 px-1 py-2">
                <span className="loading-line h-4 w-4 rounded-full" />
                <span className="loading-line h-3 flex-1" />
                <span className="loading-line h-3 w-16" />
              </li>
            ))}
            <span className="sr-only">Loading tasks...</span>
          </ul>
        ) : error ? (
          <p className="feedback-message feedback-error mt-4" role="alert">
            <svg aria-hidden="true" className="feedback-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5h.01" />
            </svg>
            <span>Task records are unavailable.</span>
          </p>
        ) : tasks.length === 0 ? (
          <div className="empty-state mt-4 !py-10">
            <p className="font-medium">No follow-up tasks are scheduled.</p>
            <p className="mt-1 text-sm text-secondary">Tasks added to a lead appear here with their due dates.</p>
          </div>
        ) : (
          <>
            {overdueCount > 0 && (
              <p className="mt-4 border-l-4 border-[var(--ink)] bg-[var(--surface-subtle)] px-3 py-2 text-[13px] font-medium">
                {overdueCount} {overdueCount === 1 ? "task is" : "tasks are"} overdue
              </p>
            )}
            <ul className="mt-4 space-y-2">
              {tasks.map((task) => {
                const overdue = task.status === "pending" && isOverdue(task.dueDate);
                return (
                  <li key={task.id} className="task-row flex min-h-12 items-center gap-3 px-3 py-2.5">
                    <span aria-hidden="true" className="task-marker">
                      {task.status === "pending" ? "" : <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
                    </span>
                    <span className={`min-w-0 flex-1 overflow-wrap-anywhere text-sm ${task.status === "pending" ? "font-medium" : "text-secondary line-through"}`}>
                      {task.title}
                    </span>
                    <time
                      dateTime={task.dueDate}
                      className={`shrink-0 whitespace-nowrap text-xs font-medium ${overdue ? "task-due-overdue" : "text-secondary"}`}
                    >
                      {describeDueDate(task.dueDate)}
                    </time>
                    <span className="sr-only">Exact due date {formatDueDate(task.dueDate)}</span>
                    <button
                      type="button"
                      className="button-secondary min-h-9 shrink-0 px-2.5 text-xs"
                      disabled={pendingTaskIds.includes(task.id)}
                      aria-label={task.status === "pending" ? `Complete ${task.title}` : `Reopen ${task.title}`}
                      onClick={() => onTaskStatusChange(task.id, task.status === "pending" ? "done" : "pending")}
                    >
                      {pendingTaskIds.includes(task.id)
                        ? "Saving..."
                        : task.status === "pending"
                          ? "Complete"
                          : "Reopen"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="panel-surface flex min-w-0 flex-col">
        <div className="panel-header">
          <h2 id="activity-heading" className="section-heading">Recent activity</h2>
          {!loading && !error && activities.length > 0 && (
            <span className="count-badge">{activities.length} updates</span>
          )}
        </div>

        {loading ? (
          <ul className="mt-4 space-y-4" role="status" aria-label="Loading activity">
            {[0, 1, 2].map((row) => (
              <li key={row} className="flex gap-3">
                <span className="loading-line h-8 w-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <span className="loading-line block h-3 w-24" />
                  <span className="loading-line block h-3 w-full" />
                </div>
              </li>
            ))}
            <span className="sr-only">Loading activity...</span>
          </ul>
        ) : error ? (
          <p className="feedback-message feedback-error mt-4" role="alert">
            <svg aria-hidden="true" className="feedback-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5h.01" />
            </svg>
            <span>Activity records are unavailable.</span>
          </p>
        ) : activities.length === 0 ? (
          <div className="empty-state mt-4 !py-10">
            <p className="font-medium">No activity recorded yet.</p>
            <p className="mt-1 text-sm text-secondary">Team updates to the pipeline will appear here.</p>
          </div>
        ) : (
          <ol className="mt-4 space-y-0">
            {activities.map((activity, index) => (
              <li key={activity.id} className="activity-item">
                <span aria-hidden="true" className="activity-avatar">{initials(activity.user)}</span>
                <div className="min-w-0 flex-1 pb-5">
                  <p className="text-sm font-semibold leading-snug">{activity.user}</p>
                  <p className="mt-0.5 overflow-wrap-anywhere text-sm leading-relaxed text-secondary">
                    {activity.description}
                  </p>
                  <p className="mt-1.5 text-xs text-muted">{activity.time}</p>
                </div>
                {index < activities.length - 1 && <span aria-hidden="true" className="activity-rail" />}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}