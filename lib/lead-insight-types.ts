export type NextBestAction = {
  action: string;
  reason: string;
  urgency: "overdue" | "today" | "soon" | "on_track";
  source: "rule" | "model";
};

export type LeadInsight = {
  summary: string;
  action: NextBestAction;
  noteCount: number;
  openTaskCount: number;
};
