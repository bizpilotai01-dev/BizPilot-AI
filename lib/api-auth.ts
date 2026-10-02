import { NextResponse } from "next/server";

import { supabase, supabaseAdmin } from "@/lib/supabase";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export type WorkspaceContext = {
  user: AuthenticatedUser;
  businessId: string;
  role: string;
};

type AuthResult<T> =
  | { ok: true; context: T }
  | { ok: false; response: NextResponse };

export async function authenticateRequest(request: Request): Promise<AuthResult<AuthenticatedUser>> {
  if (!supabase || !supabaseAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }),
    };
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in is required." }, { status: 401 }),
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Your session is invalid or expired. Sign in again." }, { status: 401 }),
    };
  }

  return {
    ok: true,
    context: { id: data.user.id, email: data.user.email },
  };
}

export async function requireWorkspace(request: Request): Promise<AuthResult<WorkspaceContext>> {
  const authResult = await authenticateRequest(request);
  if (!authResult.ok) return authResult;

  const { data: profile, error } = await supabaseAdmin!
    .from("profiles")
    .select("business_id, role")
    .eq("id", authResult.context.id)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Workspace profile could not be loaded." }, { status: 500 }),
    };
  }

  if (!profile?.business_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Complete business onboarding to access your workspace." }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: {
      user: authResult.context,
      businessId: profile.business_id,
      role: profile.role ?? "owner",
    },
  };
}
