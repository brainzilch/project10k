import { getDb } from "@/lib/db";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

type ProfileRevision = {
  id: number;
  name: string;
  bio: string;
  ai_feedback: string | null;
  applied_on: string;
};

export default function ProfilePage() {
  const revisions = getDb()
    .prepare(
      "SELECT id, name, bio, ai_feedback, applied_on FROM profile_revisions ORDER BY id DESC",
    )
    .all() as ProfileRevision[];
  const latest = revisions[0];

  return (
    <div>
      <h1>プロフィール</h1>
      <ProfileForm
        initialName={latest?.name ?? ""}
        initialBio={latest?.bio ?? ""}
      />

      {revisions.length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>変更の記録</h2>
          {revisions.map((r) => (
            <div key={r.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="badge warn">この文にした日 {r.applied_on}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {r.name}
                </span>
              </div>
              <pre className="plain">{r.bio}</pre>
              {r.ai_feedback && (
                <pre
                  className="plain muted"
                  style={{ fontSize: 13, borderLeft: "2px solid #2a2f3a", paddingLeft: 8 }}
                >
                  {r.ai_feedback}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
