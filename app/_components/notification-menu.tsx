"use client";

import { useEffect, useRef, useState } from "react";

import type { AppNotification } from "@/lib/notifications";

type NotificationMenuProps = {
  notifications: AppNotification[];
  dismissed: ReadonlySet<string>;
  onDismiss: (id: string) => void;
  onSelect: (leadId: string) => void;
};

export function NotificationMenu({ notifications, dismissed, onDismiss, onSelect }: NotificationMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((notification) => !dismissed.has(notification.id));
  const dismissedCount = notifications.length - unread.length;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="button-secondary relative min-h-11 px-3"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        onClick={() => setOpen((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread.length > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <span className="text-[11px] text-secondary" role="status" aria-live="polite">
              {unread.length} unread
            </span>
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-5 text-sm leading-relaxed text-secondary">
              Nothing needs your attention right now.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((notification) => {
                const isUnread = !dismissed.has(notification.id);
                return (
                  <li key={notification.id} className="border-b border-subtle last:border-b-0">
                    <div className={isUnread ? "notification-row notification-row-unread" : "notification-row"}>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          onSelect(notification.leadId);
                          setOpen(false);
                        }}
                      >
                        <span className="block text-sm font-semibold">{notification.title}</span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-secondary">
                          {notification.detail}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 px-2 text-[11px] font-medium text-secondary underline-offset-2 hover:underline"
                        onClick={() => onDismiss(notification.id)}
                        aria-label={isUnread ? `Mark "${notification.detail}" as read` : `Show "${notification.detail}" again`}
                      >
                        {isUnread ? "Mark read" : "Restore"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {dismissedCount > 0 && (
            <div className="border-t border-subtle px-4 py-2 text-[11px] text-secondary">
              {dismissedCount} dismissed. Restoring an item brings it back.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
