"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseBrowser =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (!supabaseBrowser) {
    throw new Error("Supabase authentication is not configured.");
  }

  const { data, error } = await supabaseBrowser.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  if (!data.session) {
    throw new Error("Sign in to access your BizPilot workspace.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);

  return fetch(input, { ...init, headers });
}
