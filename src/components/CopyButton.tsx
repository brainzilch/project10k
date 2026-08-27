"use client";

import { useState } from "react";

// Copies text for pasting into the X app. navigator.clipboard needs a secure
// context (localhost is fine, plain LAN IP is not), so fall back to the legacy
// execCommand path for phone access over http://<PC-IP>:3000.
export default function CopyButton({
  text,
  label = "コピー",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button className="secondary" onClick={copy}>
      {copied ? "コピー済み ✓" : label}
    </button>
  );
}
