export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export type TaskStatus = "pending" | "done";

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
  status: LeadStatus;
  value: number;
  owner: string;
  nextAction: string;
  lastContactAt: string;
  tags: string[];
  photoUrl?: string | null;
}

export interface Business {
  id: string;
  name: string;
  industry: string;
  ownerId: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: "owner" | "sales" | "manager";
  businessId: string;
  createdAt: string;
}

export interface InactiveLeadAlert {
  id: string;
  name: string;
  company: string;
  status: LeadStatus;
  idleDays: number;
  neverContacted: boolean;
  value: number;
  severity: "critical" | "warning";
  reason: string;
}

export interface DashboardSummary {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  wonLeads: number;
  pipelineValue: number;
  followUpsDue: number;
  conversionRate: number;
  inactiveLeads: number;
  inactiveThresholdDays: number;
  inactive: InactiveLeadAlert[];
  recentActivities: Array<{
    id: string;
    user: string;
    description: string;
    time: string;
  }>;
}

export interface Task {
  id: string;
  leadId: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
}

export interface LeadNote {
  id: string;
  leadId: string;
  content: string;
  author: string;
  createdAt: string;
}
