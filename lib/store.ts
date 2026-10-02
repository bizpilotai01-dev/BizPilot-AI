import type { DashboardSummary, Lead, LeadStatus, Task, TaskStatus } from "@/lib/types";

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

export interface Note {
  id: string;
  leadId: string;
  content: string;
  createdBy: string;
  createdAt: string;
}

export const businesses: Business[] = [
  {
    id: "biz_001",
    name: "Johnfidey Enterprise",
    industry: "Business Services",
    ownerId: "user_001",
    createdAt: "2026-10-01T09:00:00.000Z",
  },
];

export const profiles: Profile[] = [
  {
    id: "user_001",
    name: "Fidelix",
    email: "bizpilotai01@gmail.com",
    role: "owner",
    businessId: "biz_001",
    createdAt: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "user_002",
    name: "Sarah Adebayo",
    email: "sarah@bizpilot.test",
    role: "sales",
    businessId: "biz_001",
    createdAt: "2026-10-01T09:05:00.000Z",
  },
];

export const leads: Lead[] = [
  {
    id: "LD-1001",
    name: "Aisha Okafor",
    company: "PrimeNest Realty",
    email: "aisha@primenest.com",
    phone: "+234 803 000 1234",
    status: "qualified",
    value: 18000,
    owner: "Fidelix",
    nextAction: "Send pricing proposal and schedule a demo",
    lastContactAt: "2026-10-01",
    tags: ["real estate", "warm lead"],
  },
  {
    id: "LD-1002",
    name: "Daniel Adebayo",
    company: "Lagos Growth Labs",
    email: "daniel@lagosgrowthlabs.com",
    status: "contacted",
    value: 12000,
    owner: "Sarah",
    nextAction: "Follow up with onboarding questions",
    lastContactAt: "2026-09-28",
    tags: ["saas", "follow-up"],
  },
  {
    id: "LD-1003",
    name: "Ngozi Eze",
    company: "Northline Logistics",
    email: "ngozi@northlinelogistics.ng",
    status: "new",
    value: 22000,
    owner: "Fidelix",
    nextAction: "Confirm business needs and qualify fit",
    lastContactAt: "2026-09-30",
    tags: ["logistics", "inbound"],
  },
];

export const notes: Note[] = [
  {
    id: "note_001",
    leadId: "LD-1001",
    content: "Lead expressed interest in a fast deployment and CRM support.",
    createdBy: "user_001",
    createdAt: "2026-10-01T10:00:00.000Z",
  },
  {
    id: "note_002",
    leadId: "LD-1002",
    content: "Follow-up scheduled for tomorrow after onboarding questions are answered.",
    createdBy: "user_002",
    createdAt: "2026-09-29T09:00:00.000Z",
  },
];

export const tasks: Task[] = [
  {
    id: "task_001",
    leadId: "LD-1001",
    title: "Send pricing proposal",
    dueDate: "2026-10-02",
    status: "pending",
  },
  {
    id: "task_002",
    leadId: "LD-1002",
    title: "Confirm onboarding requirements",
    dueDate: "2026-10-03",
    status: "pending",
  },
];

export function getDashboardSummary(): DashboardSummary {
  const totalLeads = leads.length;
  const newLeads = leads.filter((lead) => lead.status === "new").length;
  const qualifiedLeads = leads.filter((lead) => lead.status === "qualified").length;
  const wonLeads = leads.filter((lead) => lead.status === "won").length;
  const lostLeads = leads.filter((lead) => lead.status === "lost").length;
  const openLeads = leads.filter((lead) => lead.status !== "won" && lead.status !== "lost");
  const pipelineValue = openLeads.reduce((sum, lead) => sum + lead.value, 0);
  const followUpsDue = tasks.filter((task) => task.status === "pending").length;
  const closedLeads = wonLeads + lostLeads;
  const conversionRate = closedLeads === 0 ? 0 : Math.round((wonLeads / closedLeads) * 100);

  return {
    totalLeads,
    newLeads,
    qualifiedLeads,
    wonLeads,
    pipelineValue,
    followUpsDue,
    conversionRate,
    recentActivities: [
      {
        id: "ACT-1",
        user: "Fidelix",
        description: "Updated proposal for PrimeNest Realty",
        time: "2 hours ago",
      },
      {
        id: "ACT-2",
        user: "Sarah",
        description: "Sent outreach message to Lagos Growth Labs",
        time: "5 hours ago",
      },
      {
        id: "ACT-3",
        user: "Mariam",
        description: "Qualified BluePeak Consulting opportunity",
        time: "Yesterday",
      },
    ],
  };
}

export function addLead(input: Partial<Lead> & Pick<Lead, "name" | "company" | "email">): Lead {
  const nextLead: Lead = {
    id: `LD-${Date.now()}`,
    name: input.name,
    company: input.company,
    email: input.email,
    phone: input.phone ?? "",
    status: (input.status ?? "new") as LeadStatus,
    value: Number(input.value ?? 0),
    owner: input.owner ?? "Sales Team",
    nextAction: input.nextAction ?? "Schedule first follow-up",
    lastContactAt: input.lastContactAt ?? new Date().toISOString().slice(0, 10),
    tags: input.tags ?? [],
  };

  leads.push(nextLead);
  return nextLead;
}

export function createProfile(input: {
  id?: string;
  name: string;
  email: string;
  role?: Profile["role"];
  businessId: string;
  createdAt?: string;
}): Profile {
  const nextProfile: Profile = {
    id: input.id ?? `user_${Date.now()}`,
    name: input.name,
    email: input.email,
    role: input.role ?? "owner",
    businessId: input.businessId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  profiles.push(nextProfile);
  return nextProfile;
}

export function createTask(input: { leadId: string; title: string; dueDate: string; status?: TaskStatus }): Task {
  const nextTask: Task = {
    id: `task_${Date.now()}`,
    leadId: input.leadId,
    title: input.title,
    dueDate: input.dueDate,
    status: input.status ?? "pending",
  };

  tasks.push(nextTask);
  return nextTask;
}

export function createBusiness(input: { name: string; industry: string; ownerId: string }): Business {
  const nextBusiness: Business = {
    id: `biz_${Date.now()}`,
    name: input.name,
    industry: input.industry,
    ownerId: input.ownerId,
    createdAt: new Date().toISOString(),
  };

  businesses.push(nextBusiness);
  return nextBusiness;
}
