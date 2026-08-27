"use client";

import { useEffect, useRef, useState } from "react";

type Attachment = {
  id: number;
  original_filename?: string;
  upload_status: string;
};

type Message = {
  id: number;
  role: string;
  content: string;
  model?: string | null;
  attachments: Attachment[];
};

type Conversation = {
  id: number;
  title: string | null;
  updated_at: string;
};

function SyncBadge({ status }: { status: string }) {
  if (status === "DRIVE_UPLOADED")
    return <span className="badge ok">Local ✓ Drive ✓</span>;
  if (status === "DRIVE_PENDING")
    return <span className="badge warn">Local ✓ Drive syncing...</span>;
  if (status === "DRIVE_FAILED")
    return <span className="badge err">Local ✓ Drive failed</span>;
  return <span className="badge ok">Local ✓</span>;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    const res = await fetch("/api/conversations");
    setConversations(await res.json());
  }

  async function openConversation(id: number) {
    setConversationId(id);
    setError("");
    const res = await fetch(`/api/conversations/${id}`);
    const data = await res.json();
    setMessages(data.messages);
  }

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    setError("");
    const form = new FormData();
    form.set("text", text);
    if (conversationId) form.set("conversation_id", String(conversationId));
    for (const f of files) form.append("images", f);

    const res = await fetch("/api/chat", { method: "POST", body: form });
    const data = await res.json();
    setSending(false);

    if (data.conversation_id) {
      setText("");
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      await openConversation(data.conversation_id);
      await loadConversations();
    }
    if (!res.ok) {
      setError(data.error ?? "送信に失敗しました");
    }
  }

  return (
    <div>
      <h1>AI Chat</h1>
      <div className="chat-layout">
        <div className="chat-sidebar">
          <button
            className="secondary new-chat-btn"
            onClick={() => {
              setConversationId(null);
              setMessages([]);
              setError("");
            }}
          >
            + New Chat
          </button>
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`conv-item${c.id === conversationId ? " active" : ""}`}
            >
              {c.title || `#${c.id}`}
            </div>
          ))}
        </div>

        <div className="chat-main">
          <div className="panel" style={{ minHeight: 240 }}>
            {messages.length === 0 && (
              <p className="muted">
                PROJECT 10KについてClaudeと話す。画像も送れる（送った画像はローカル保存され、Drive接続後は自動でGoogle Driveにも保存される）。
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 16 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {m.role === "user" ? "You" : `Claude${m.model ? ` (${m.model})` : ""}`}
                </div>
                {m.attachments.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0" }}>
                    {m.attachments.map((a) => (
                      <div key={a.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/assets/${a.id}/file`}
                          alt={a.original_filename ?? `asset ${a.id}`}
                          style={{ maxWidth: 220, maxHeight: 220, borderRadius: 6, display: "block" }}
                        />
                        <SyncBadge status={a.upload_status} />
                      </div>
                    ))}
                  </div>
                )}
                {m.content && <pre className="plain">{m.content}</pre>}
              </div>
            ))}
            {sending && <p className="muted">Claude is thinking...</p>}
            <div ref={bottom} />
          </div>

          {error && (
            <p>
              <span className="badge err">{error}</span>
            </p>
          )}

          <div className="panel">
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="メッセージを書く"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <button onClick={send} disabled={sending || (!text.trim() && files.length === 0)}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
            {files.length > 0 && (
              <p className="muted" style={{ marginBottom: 0 }}>
                添付: {files.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
