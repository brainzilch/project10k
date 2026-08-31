import Link from "next/link";
import { getDb } from "@/lib/db";
import { postTypeLabel } from "@/lib/labels";
import CopyButton from "@/components/CopyButton";
import ImportMetricsForm from "./ImportMetricsForm";
import MetricsForm from "./MetricsForm";
import DraftActions from "./DraftActions";
import PublishButton from "./PublishButton";
import SwipeablePost from "./SwipeablePost";

export const dynamic = "force-dynamic";

type Post = {
  id: number;
  origin: string;
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

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; record?: string }>;
}) {
  const { filter, record } = await searchParams;
  const unrecordedOnly = filter === "unrecorded";
  const staleOnly = filter === "stale";

  const db = getDb();
  // discarded posts are logically deleted - kept in the DB, hidden here
  const allPosts = db
    .prepare("SELECT * FROM posts WHERE status != 'DISCARDED' ORDER BY id DESC")
    .all() as Post[];
  const metrics = db
    .prepare("SELECT * FROM post_metrics ORDER BY measured_at ASC")
    .all() as Metric[];
  const tagRows = db
    .prepare(
      `SELECT pt.post_id, t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id`,
    )
    .all() as { post_id: number; name: string }[];
  const revisionRows = db
    .prepare(
      "SELECT post_id, revision, kind, text, ai_feedback, created_at FROM post_revisions ORDER BY post_id, revision ASC",
    )
    .all() as {
    post_id: number;
    revision: number;
    kind: string;
    text: string;
    ai_feedback: string | null;
    created_at: string;
  }[];

  const metricsByPost = new Map<number, Metric[]>();
  for (const m of metrics) {
    const list = metricsByPost.get(m.post_id) ?? [];
    list.push(m);
    metricsByPost.set(m.post_id, list);
  }

  const isUnrecorded = (p: Post) =>
    p.status === "PUBLISHED" && (metricsByPost.get(p.id) ?? []).length === 0;
  const isStaleDraft = (p: Post) =>
    p.status === "DRAFT" &&
    Date.now() - Date.parse(p.created_at.slice(0, 19).replace(" ", "T") + "Z") >=
      24 * 60 * 60 * 1000;
  const staleCount = allPosts.filter(isStaleDraft).length;
  const daysSince = (sqliteDateTime: string) =>
    Math.max(
      0,
      Math.floor(
        (Date.now() -
          Date.parse(sqliteDateTime.slice(0, 19).replace(" ", "T") + "Z")) /
          (24 * 60 * 60 * 1000),
      ),
    );
  const unrecordedCount = allPosts.filter(isUnrecorded).length;
  const posts = unrecordedOnly
    ? allPosts.filter(isUnrecorded)
    : staleOnly
      ? allPosts.filter(isStaleDraft)
      : allPosts;
  const tagsByPost = new Map<number, string[]>();
  for (const t of tagRows) {
    const list = tagsByPost.get(t.post_id) ?? [];
    list.push(t.name);
    tagsByPost.set(t.post_id, list);
  }
  const revisionsByPost = new Map<number, typeof revisionRows>();
  for (const r of revisionRows) {
    const list = revisionsByPost.get(r.post_id) ?? [];
    list.push(r);
    revisionsByPost.set(r.post_id, list);
  }
  const kindLabel = (kind: string, draftNumber: number) =>
    kind === "RAW"
      ? "第1稿（原文）"
      : kind === "REWRITE"
        ? `第${draftNumber}稿（書き直し）`
        : kind === "AI_EDIT"
          ? "AI提案"
          : "完成版";

  return (
    <div>
      <h1>投稿一覧</h1>
      {staleCount > 0 && !staleOnly && (
        <Link href="/posts?filter=stale" style={{ display: "block" }}>
          <div
            className="panel"
            style={{ borderColor: "#d29922", color: "#d29922", padding: "10px 16px" }}
          >
            DRAFT滞留 {staleCount}件：公開か破棄を決めよう →
          </div>
        </Link>
      )}
      {staleOnly && (
        <div style={{ marginBottom: 12 }}>
          <Link href="/posts">
            <button className="secondary">✓ 滞留DRAFTのみ（解除）</button>
          </Link>
        </div>
      )}
      <ImportMetricsForm />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <Link href={unrecordedOnly ? "/posts" : "/posts?filter=unrecorded"}>
          <button className="secondary">
            {unrecordedOnly ? "✓ 未記録のみ（解除）" : "未記録のみ"}
          </button>
        </Link>
        {unrecordedCount > 0 && (
          <span className="muted" style={{ fontSize: 13 }}>
            数字未記録の公開投稿 {unrecordedCount}件
          </span>
        )}
      </div>
      {posts.length === 0 && (
        <p className="muted">
          {unrecordedOnly ? "数字未記録の公開投稿はありません。" : "まだ投稿がありません。"}
        </p>
      )}
      {posts.map((p) => (
        <SwipeablePost key={p.id} postId={p.id} swipeEnabled={p.status === "DRAFT"}>
        <div id={`post-${p.id}`} className="panel">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong>#{p.id}</strong>
            {p.origin === "X_DIRECT" && <span className="badge warn">直接投稿(X)</span>}
            <span className="badge">{postTypeLabel(p.post_type)}</span>
            <span
              className={`badge ${p.status === "PUBLISHED" ? "ok" : p.status === "FINAL" ? "warn" : ""}`}
            >
              {p.status === "PUBLISHED"
                ? "投稿済み"
                : p.status === "FINAL"
                  ? "完成版保存済み"
                  : "下書き"}
            </span>
            {p.minimal_edit_used === 1 && <span className="badge">minimal edit</span>}
            {isUnrecorded(p) && (
              <Link
                href={`/posts?record=${p.id}${unrecordedOnly ? "&filter=unrecorded" : ""}#post-${p.id}`}
              >
                <span className="badge err" style={{ cursor: "pointer" }}>
                  数字未記録
                </span>
              </Link>
            )}
            {(tagsByPost.get(p.id) ?? []).map((t) => (
              <span key={t} className="badge">
                {t}
              </span>
            ))}
            <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
              {p.created_at}
            </span>
            {p.status === "DRAFT" && (
              <span className={`badge ${daysSince(p.created_at) >= 3 ? "err" : ""}`}>
                {daysSince(p.created_at)}日滞留
              </span>
            )}
          </div>

          {(() => {
            const revisions = revisionsByPost.get(p.id) ?? [];
            if (revisions.length === 0) {
              // direct X posts and posts created before revision tracking
              return (
                <>
                  <h2>{p.origin === "X_DIRECT" ? "本文（Xから取込）" : "原文"}</h2>
                  <pre className="plain">{p.raw_text}</pre>
                  {p.ai_feedback && (
                    <>
                      <h2>AI診断</h2>
                      <pre className="plain muted">{p.ai_feedback}</pre>
                    </>
                  )}
                  {p.ai_minimal_edit && (
                    <>
                      <h2>AI提案</h2>
                      <pre className="plain muted">{p.ai_minimal_edit}</pre>
                    </>
                  )}
                </>
              );
            }
            let draftNumber = 0;
            return (
              <>
                <h2>推敲の記録</h2>
                {revisions.map((r) => {
                  if (r.kind === "RAW" || r.kind === "REWRITE") draftNumber++;
                  return (
                    <div key={r.revision} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span
                          className={`badge ${r.kind === "FINAL" ? "ok" : r.kind === "AI_EDIT" ? "" : "warn"}`}
                        >
                          {kindLabel(r.kind, draftNumber)}
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {r.created_at}
                        </span>
                      </div>
                      <pre className={`plain${r.kind === "AI_EDIT" ? " muted" : ""}`}>
                        {r.text}
                      </pre>
                      {r.ai_feedback && (
                        <pre
                          className="plain muted"
                          style={{ fontSize: 13, borderLeft: "2px solid #2a2f3a", paddingLeft: 8 }}
                        >
                          {r.ai_feedback}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}

          {p.final_text && (
            <div style={{ marginTop: 8 }}>
              <CopyButton text={p.final_text} label="完成版をコピー" />
            </div>
          )}

          {(metricsByPost.get(p.id) ?? []).length > 0 && (
            <>
              <h2>数字の記録</h2>
              <table>
                <thead>
                  <tr>
                    <th>記録日時</th>
                    <th>インプ</th>
                    <th>いいね</th>
                    <th>RP</th>
                    <th>返信</th>
                    <th>ブクマ</th>
                    <th>プロフ</th>
                    <th>フォロー</th>
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

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <MetricsForm postId={p.id} autoOpen={record === String(p.id)} />
            {p.status === "FINAL" && <PublishButton postId={p.id} />}
            {p.status === "DRAFT" && <DraftActions postId={p.id} />}
          </div>
        </div>
        </SwipeablePost>
      ))}
    </div>
  );
}
