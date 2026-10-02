"use client";

import Image from "next/image";
import { useEffect, useState, type ChangeEvent } from "react";

import { authorizedFetch } from "@/lib/supabase-browser";

type TeamProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  photoUrl: string | null;
  isCurrentUser: boolean;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function TeamProfiles() {
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    authorizedFetch("/api/profiles")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.items)) {
          throw new Error(payload.error ?? "Workspace profiles could not be loaded.");
        }
        if (active) setProfiles(payload.items as TeamProfile[]);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Workspace profiles could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    setMessage("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (!file.size || file.size > 3 * 1024 * 1024) {
      setError("Choose an image smaller than 3 MB.");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("photo", file);
      const response = await authorizedFetch("/api/profiles/photo", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || typeof payload.photoUrl !== "string") {
        throw new Error(payload.error ?? "Profile photo could not be saved.");
      }
      setProfiles((current) => current.map((profile) =>
        profile.isCurrentUser ? { ...profile, photoUrl: payload.photoUrl } : profile,
      ));
      setMessage(payload.warning ?? "Your profile photo was updated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Profile photo could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="module-surface mt-4" aria-labelledby="team-profiles-heading">
      <div className="panel-header">
        <div>
          <h2 id="team-profiles-heading" className="section-heading">Workspace team</h2>
          <p className="mt-1 text-sm text-secondary">Add a profile photo so teammates can recognize you.</p>
        </div>
      </div>
      {error && <p className="feedback-message feedback-error mt-3" role="alert">{error}</p>}
      {message && <p className="feedback-message feedback-success mt-3" role="status">{message}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-secondary" role="status">Loading team profiles...</p>
      ) : profiles.length ? (
        <ul className="team-profile-list mt-4">
          {profiles.map((profile) => (
            <li key={profile.id} className="team-profile-row">
              <span className="team-profile-avatar">
                {profile.photoUrl
                  ? <Image src={profile.photoUrl} alt="" width={44} height={44} unoptimized />
                  : <span aria-hidden="true">{initials(profile.name || profile.email)}</span>}
              </span>
              <span className="team-profile-copy">
                <span className="font-medium">{profile.name || profile.email}</span>
                <span className="text-sm text-secondary">{profile.email} · {profile.role}</span>
              </span>
              {profile.isCurrentUser && (
                <label className="button-secondary min-h-10 cursor-pointer px-3 text-xs">
                  {saving ? "Uploading..." : profile.photoUrl ? "Change photo" : "Add photo"}
                  <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} disabled={saving} />
                </label>
              )}
            </li>
          ))}
        </ul>
      ) : !error ? (
        <p className="mt-4 text-sm text-secondary">No team profiles are linked to this workspace yet.</p>
      ) : null}
    </section>
  );
}
