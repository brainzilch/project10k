"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";

type Step = "raw" | "diagnosed" | "done";

export default function ComposePage() {
  const [rawText, setRawText] = useState("");
  const [postType, setPostType] = useState<"PRIMARY" | "CASUAL">("PRIMARY");
  const [tags, setTags] = useState("");
  const [postId, setPostId] = useState<number | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftCount, setDraftCount] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [aiEdit, setAiEdit] = useState("");
  const [styleEdit, setStyleEdit] = useState("");
  const [finalText, setFinalText] = useState("");
  const [step, setStep] = useState<Step>("raw");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function runDiagnosis(id: number) {
    setBusy("diagnosing");
    const res = await fetch(`/api/posts/${id}/diagnose`, { method: "POST" });
    const data = await res.json();
    setBusy("");
    if (!res.ok) {
      setError(data.error ?? "診断に失敗しました（原稿は保存済み）");
      return false;
    }
    setFeedback(data.ai_feedback);
    setAiEdit(data.ai_minimal_edit);
    setDraftCount(data.draft_count);
    return true;
  }

  async function saveAndDiagnose() {
    setError("");
    setBusy("saving");
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_text: rawText,
        post_type: postType,
        tags: tags.split(/[,、\s]+/).filter(Boolean),
      }),
    });
    if (!res.ok) {
      setBusy("");
      setError("保存に失敗しました");
      return;
    }
    const { id } = await res.json();
    setPostId(id);
    setDraftText(rawText);
    setFinalText(rawText);
    setStep("diagnosed");
    await runDiagnosis(id);
  }

  // 型変換（セリフ型）: 事実は変えずに会話形式へ。1案のみ、採用時に履歴へ記録
  async function convertToDialogue() {
    if (!postId) return;
    setError("");
    setBusy("converting");
    const res = await fetch(`/api/posts/${postId}/style-convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(data.error ?? "型変換に失敗しました");
      return;
    }
    setStyleEdit(data.text ?? "");
  }

  async function adoptStyleEdit() {
    if (!postId || !styleEdit) return;
    setBusy("adopting");
    const res = await fetch(`/api/posts/${postId}/style-convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adopt: true, text: styleEdit }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(data.error ?? "採用に失敗しました");
      return;
    }
    setDraftText(styleEdit);
    setFinalText(styleEdit);
    if (typeof data.draft_count === "number") setDraftCount(data.draft_count);
    setStyleEdit("");
  }

  // 書き直しを新しい稿として保存し、その稿を再診断する
  async function saveRewrite() {
    if (!postId) return;
    setError("");
    setBusy("rewriting");
    const res = await fetch(`/api/posts/${postId}/rewrite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: draftText }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy("");
      setError(data.error ?? "書き直しの保存に失敗しました");
      return;
    }
    setDraftCount(data.draft_count);
    setFinalText(draftText);
    await runDiagnosis(postId);
  }

  async function saveFinal(published: boolean) {
    if (!postId) return;
    setError("");
    setBusy("finalizing");
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        final_text: finalText,
        minimal_edit_used: aiEdit !== "" && finalText === aiEdit,
        published,
      }),
    });
    setBusy("");
    if (!res.ok) {
      setError("完成版の保存に失敗しました");
      return;
    }
    setStep("done");
  }

  function reset() {
    setRawText("");
    setTags("");
    setPostId(null);
    setDraftText("");
    setDraftCount(1);
    setFeedback("");
    setAiEdit("");
    setStyleEdit("");
    setFinalText("");
    setStep("raw");
    setError("");
  }

  return (
    <div>
      <h1>投稿を書く</h1>
      {error && (
        <p>
          <span className="badge err">{error}</span>
        </p>
      )}

      {step === "raw" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>原文（本人が書く）</h2>
          <textarea
            rows={6}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="X投稿の原文を書く"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value as "PRIMARY" | "CASUAL")}
            >
              <option value="PRIMARY">本気投稿</option>
              <option value="CASUAL">気軽な投稿</option>
            </select>
            <input
              placeholder="タグ（カンマ/空白区切り）"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button onClick={saveAndDiagnose} disabled={!rawText.trim() || busy !== ""}>
              {busy === "saving" ? "Saving..." : "保存して診断"}
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            文字数: {rawText.length}
          </p>
        </div>
      )}

      {step === "diagnosed" && (
        <>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>
              現在の原稿（第{draftCount}稿）
              {busy === "diagnosing" && <span className="muted">　診断中...</span>}
            </h2>
            <textarea
              rows={6}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                onClick={saveRewrite}
                disabled={busy !== "" || !draftText.trim()}
              >
                {busy === "rewriting" || busy === "diagnosing"
                  ? "保存・再診断中..."
                  : "書き直しを保存して再診断"}
              </button>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              文字数: {draftText.length}
              ／書き直すたびに全ての稿が記録されます（推敲の過程も資産）
            </p>
          </div>

          {feedback && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>AI診断（5項目）</h2>
              <pre className="plain">{feedback}</pre>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="secondary"
                  onClick={convertToDialogue}
                  disabled={busy !== ""}
                >
                  {busy === "converting" ? "変換中..." : "セリフ型に変換"}
                </button>
                <span className="muted" style={{ fontSize: 13 }}>
                  事実は変えず、会話形式に書き換える（過去に伸びた型）
                </span>
              </div>
            </div>
          )}

          {styleEdit && (
            <div className="panel" style={{ borderColor: "#a371f7" }}>
              <h2 style={{ marginTop: 0 }}>セリフ型（AI案・1案のみ）</h2>
              <pre className="plain">{styleEdit}</pre>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={adoptStyleEdit} disabled={busy !== ""}>
                  {busy === "adopting" ? "採用中..." : "この型を採用する"}
                </button>
                <button
                  className="secondary"
                  onClick={() => setStyleEdit("")}
                  disabled={busy !== ""}
                >
                  使わない
                </button>
              </div>
              <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
                採用すると原稿と完成版に反映され、推敲履歴に「型変換: セリフ」として残ります
              </p>
            </div>
          )}

          {aiEdit && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>提案反映版（AI案・1案のみ）</h2>
              <pre className="plain">{aiEdit}</pre>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button className="secondary" onClick={() => setFinalText(aiEdit)}>
                  この文面を完成版の候補にする
                </button>
                <button
                  className="secondary"
                  onClick={() => setDraftText(aiEdit)}
                >
                  これを下書きに入れて自分で調整する
                </button>
              </div>
            </div>
          )}

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>完成版</h2>
            <textarea
              rows={6}
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={() => saveFinal(false)} disabled={!finalText.trim() || busy !== ""}>
                完成版を保存
              </button>
              <button onClick={() => saveFinal(true)} disabled={!finalText.trim() || busy !== ""}>
                完成版を保存＋投稿済みにする
              </button>
              <CopyButton text={finalText} label="完成版をコピー" />
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              文字数: {finalText.length}（Xへの投稿は本人が行う）
            </p>
          </div>
        </>
      )}

      {step === "done" && (
        <div className="panel">
          <p>
            保存しました。<span className="badge ok">post #{postId}</span>
            <span className="muted">　全{draftCount}稿の推敲記録つき</span>
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopyButton text={finalText} label="完成版をコピー（Xへ貼り付け）" />
            <button onClick={reset}>次の投稿を書く</button>
          </div>
        </div>
      )}
    </div>
  );
}
