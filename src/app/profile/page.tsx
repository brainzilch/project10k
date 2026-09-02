import { getDb } from "@/lib/db";
import ProfileForm from "./ProfileForm";
import PinnedPostForm from "./PinnedPostForm";
import { pinnedCandidates, pinnedHistory, publishedPostOptions } from "@/lib/pinned";

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
  const pinned = pinnedHistory();
  const currentPinned = pinned[0] ?? null;

  return (
    <div>
      <h1>プロフィール</h1>
      <ProfileForm
        initialName={latest?.name ?? ""}
        initialBio={latest?.bio ?? ""}
      />

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>固定ポスト</h2>
        {currentPinned ? (
          <p className="muted" style={{ marginTop: 0 }}>
            現在: #{currentPinned.post_id}「
            {currentPinned.text.replace(/\s+/g, " ").slice(0, 40)}」（
            {currentPinned.applied_on} に固定）
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            未設定。プロフィールに来た人が最初に見る投稿。候補から選ぶかX側で固定した投稿を記録する
          </p>
        )}
        <PinnedPostForm
          currentPostId={currentPinned?.post_id ?? null}
          options={publishedPostOptions()}
          candidates={pinnedCandidates()}
        />
        {pinned.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="muted" style={{ margin: "0 0 4px" }}>変更履歴（プロフ訪問→フォロー転換率: 前7日 → 後7日）</p>
            {pinned.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "3px 0" }}>
                <span className="badge" style={{ borderColor: "#a371f7", color: "#a371f7" }}>
                  固定にした日 {r.applied_on}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  #{r.post_id} {r.text.replace(/\s+/g, " ").slice(0, 30)}
                </span>
                <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                  {r.before != null ? `${r.before}%` : "-"}（{r.beforeVisits}訪問） → {r.after != null ? `${r.after}%` : "-"}（{r.afterVisits}訪問）
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
