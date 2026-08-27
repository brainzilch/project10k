"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";

type Step = "raw" | "diagnosed" | "done";

export default function ComposePage() {
  const [rawText, setRawText] = useState("");
  const [postType, setPostType] = useState<"PRIMARY" | "CASUAL">("PRIMARY");
  const [tags, setTags] = useState("");
  const [postId, setPostId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [minimalEdit, setMinimalEdit] = useState("");
  const [finalText, setFinalText] = useState("");
  const [step, setStep] = useState<Step>("raw");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

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
    setBusy("diagnosing");
    const diag = await fetch(`/api/posts/${id}/diagnose`, { method: "POST" });
    const data = await diag.json();
    setBusy("");
    if (!diag.ok) {
      setError(data.error ?? "診断に失敗しました（RAWは保存済み）");
      setStep("diagnosed");
      return;
    }
    setFeedback(data.ai_feedback);
    setFinalText(rawText);
    setStep("diagnosed");
  }

  async function requestMinimalEdit() {
    if (!postId) return;
    setError("");
    setBusy("editing");
    const res = await fetch(`/api/posts/${postId}/minimal-edit`, {
      method: "POST",
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) {
      setError(data.error ?? "最小修正版の生成に失敗しました");
      return;
    }
    setMinimalEdit(data.ai_minimal_edit);
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
        minimal_edit_used: minimalEdit !== "" && finalText === minimalEdit,
        published,
      }),
    });
    setBusy("");
    if (!res.ok) {
      setError("FINALの保存に失敗しました");
      return;
    }
    setStep("done");
  }

  function reset() {
    setRawText("");
    setTags("");
    setPostId(null);
    setFeedback("");
    setMinimalEdit("");
    setFinalText("");
    setStep("raw");
    setError("");
  }

  return (
    <div>
      <h1>Compose</h1>
      {error && (
        <p>
          <span className="badge err">{error}</span>
        </p>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>RAW（本人が書く原文）</h2>
        <textarea
          rows={6}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="X投稿の原文を書く"
          disabled={step !== "raw"}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <select
            value={postType}
            onChange={(e) => setPostType(e.target.value as "PRIMARY" | "CASUAL")}
            disabled={step !== "raw"}
          >
            <option value="PRIMARY">PRIMARY</option>
            <option value="CASUAL">CASUAL</option>
          </select>
          <input
            placeholder="タグ（カンマ/空白区切り）"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            disabled={step !== "raw"}
            style={{ flex: 1, minWidth: 200 }}
          />
          {step === "raw" && (
            <button onClick={saveAndDiagnose} disabled={!rawText.trim() || busy !== ""}>
              {busy === "saving"
                ? "Saving..."
                : busy === "diagnosing"
                  ? "診断中..."
                  : "保存して診断"}
            </button>
          )}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          文字数: {rawText.length}
        </p>
      </div>

      {step !== "raw" && feedback && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>AI診断（5項目）</h2>
          <pre className="plain">{feedback}</pre>
        </div>
      )}

      {step === "diagnosed" && (
        <>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>最小修正版（任意・1案のみ）</h2>
            {minimalEdit ? (
              <>
                <pre className="plain">{minimalEdit}</pre>
                <button
                  className="secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => setFinalText(minimalEdit)}
                >
                  この版をFINAL候補にする
                </button>
              </>
            ) : (
              <button
                className="secondary"
                onClick={requestMinimalEdit}
                disabled={busy !== ""}
              >
                {busy === "editing" ? "生成中..." : "最小修正版を見る"}
              </button>
            )}
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>FINAL</h2>
            <textarea
              rows={6}
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={() => saveFinal(false)} disabled={!finalText.trim() || busy !== ""}>
                FINAL保存
              </button>
              <button onClick={() => saveFinal(true)} disabled={!finalText.trim() || busy !== ""}>
                FINAL保存＋投稿済みにする
              </button>
              <CopyButton text={finalText} label="FINALをコピー" />
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
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopyButton text={finalText} label="FINALをコピー（Xへ貼り付け）" />
            <button onClick={reset}>次の投稿を書く</button>
          </div>
        </div>
      )}
    </div>
  );
}
