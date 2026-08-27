import { getDb } from "@/lib/db";
import CopyButton from "@/components/CopyButton";
import MetricsForm from "./MetricsForm";

export const dynamic = "force-dynamic";

type Post = {
  id: number;
  post_type: string;
  raw_text: string;
  ai_feedback: string | null;
  ai_minimal_edit: string | null;
  final_text: string | null;
  minimal_edit_used: number;
  status: string;
  created_at: string;
  published_at: string | null;
};

type Metric = {
  post_id: number;
  measured_at: string;
  impressions: number | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  bookmarks: number | null;
  profile_visits: number | null;
  follows: number | null;
};

export default function PostsPage() {
  const db = getDb();
  const posts = db
    .prepare("SELECT * FROM posts ORDER BY id DESC")
    .all() as Post[];
  const metrics = db
    .prepare("SELECT * FROM post_metrics ORDER BY measured_at ASC")
    .all() as Metric[];
  const tagRows = db
    .prepare(
      `SELECT pt.post_id, t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id`,
    )
    .all() as { post_id: number; name: string }[];

  const metricsByPost = new Map<number, Metric[]>();
  for (const m of metrics) {
    const list = metricsByPost.get(m.post_id) ?? [];
    list.push(m);
    metricsByPost.set(m.post_id, list);
  }
  const tagsByPost = new Map<number, string[]>();
  for (const t of tagRows) {
    const list = tagsByPost.get(t.post_id) ?? [];
    list.push(t.name);
    tagsByPost.set(t.post_id, list);
  }

  return (
    <div>
      <h1>Posts</h1>
      {posts.length === 0 && <p className="muted">まだ投稿がありません。</p>}
      {posts.map((p) => (
        <div key={p.id} className="panel">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong>#{p.id}</strong>
            <span className="badge">{p.post_type}</span>
            <span
              className={`badge ${p.status === "PUBLISHED" ? "ok" : p.status === "FINAL" ? "warn" : ""}`}
            >
              {p.status}
            </span>
            {p.minimal_edit_used === 1 && <span className="badge">minimal edit</span>}
            {(tagsByPost.get(p.id) ?? []).map((t) => (
              <span key={t} className="badge">
                {t}
              </span>
            ))}
            <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
              {p.created_at}
            </span>
          </div>

          <h2>RAW</h2>
          <pre className="plain">{p.raw_text}</pre>

          {p.ai_feedback && (
            <>
              <h2>AI診断</h2>
              <pre className="plain muted">{p.ai_feedback}</pre>
            </>
          )}

          {p.ai_minimal_edit && (
            <>
              <h2>最小修正版</h2>
              <pre className="plain muted">{p.ai_minimal_edit}</pre>
            </>
          )}

          {p.final_text && (
            <>
              <h2>FINAL</h2>
              <pre className="plain">{p.final_text}</pre>
              <div style={{ marginTop: 8 }}>
                <CopyButton text={p.final_text} label="FINALをコピー" />
              </div>
            </>
          )}

          {(metricsByPost.get(p.id) ?? []).length > 0 && (
            <>
              <h2>メトリクス</h2>
              <table>
                <thead>
                  <tr>
                    <th>Measured</th>
                    <th>Imp</th>
                    <th>Likes</th>
                    <th>RP</th>
                    <th>Rep</th>
                    <th>BM</th>
                    <th>Prof</th>
                    <th>Fol</th>
                  </tr>
                </thead>
                <tbody>
                  {(metricsByPost.get(p.id) ?? []).map((m, i) => (
                    <tr key={i}>
                      <td>{m.measured_at}</td>
                      <td>{m.impressions ?? "-"}</td>
                      <td>{m.likes ?? "-"}</td>
                      <td>{m.reposts ?? "-"}</td>
                      <td>{m.replies ?? "-"}</td>
                      <td>{m.bookmarks ?? "-"}</td>
                      <td>{m.profile_visits ?? "-"}</td>
                      <td>{m.follows ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={{ marginTop: 12 }}>
            <MetricsForm postId={p.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
