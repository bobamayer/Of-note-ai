import { useState, useRef } from "react";

const SYSTEM_PROMPT = `You are "Of Note" — a sharp, warm executive assistant who is genuinely invested in helping professionals get the most out of their meetings, brainstorms, and reflections.

Your job is to analyze notes (text, transcripts, or described images) and extract what matters most. You work in stages and NEVER move forward without user confirmation.

STAGE FLOW:
1. ANALYZE: Review the input. Identify themes, key callouts, and any goals/next steps. Present your first pass clearly.
2. REFINE: Ask if this resonates. Iterate until the user says they're happy.
3. NEXT STEPS: Once key points are confirmed, surface next steps. If none are clear, ask 2-3 focused questions to uncover them. Use SMART goal framing where relevant.
4. FINALIZE: Produce a clean plain-text summary — no markdown, no bullet symbols, no special characters. Just clean readable text.

TONE: Concise, casual, warm. Like a trusted EA who was in the room with you.

RULES:
- Never skip ahead without a green light from the user
- If image content is ambiguous, name what you CAN see and ask for context
- Assume users are somewhere between novice and expert — explain just enough
- Use SMART goal framework (Specific, Measurable, Achievable, Relevant, Time-bound) when shaping next steps
- Final output must be plain text only — no asterisks, no dashes, no markdown formatting

Always end your message by clearly stating what stage you're in and what you need from the user to move forward.`;

export default function OfNote() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileBase64, setFileBase64] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [started, setStarted] = useState(false);
  const [finalOutput, setFinalOutput] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    setFinalOutput(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target.result;
      const base64 = result.split(",")[1];
      setFileBase64(base64);
      if (file.type.startsWith("image/")) {
        setFilePreview(result);
        setFileType("image");
      } else if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        setFileType("text");
        setFilePreview(atob(base64));
      } else {
        setFileType("other");
        setFilePreview(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const callAPI = async (userContent, history) => {
    const apiMessages = history.map((m) => ({ role: m.role, content: m.content }));
    apiMessages.push({ role: "user", content: userContent });

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
      }),
    });
    const data = await response.json();
    return data.content?.find((b) => b.type === "text")?.text || "Sorry, something went wrong.";
  };

  const isFinalOutput = (text) =>
    text.toLowerCase().includes("final summary") ||
    text.toLowerCase().includes("here is your summary") ||
    text.toLowerCase().includes("here's your summary") ||
    text.toLowerCase().includes("plain text summary");

  const handleStart = async () => {
    if (!uploadedFile && !input.trim()) return;
    setLoading(true);
    setStarted(true);
    setMessages([]);

    let userContent;
    if (fileType === "image" && fileBase64) {
      userContent = [
        { type: "image", source: { type: "base64", media_type: uploadedFile.type, data: fileBase64 } },
        { type: "text", text: input.trim() ? `Here are my notes. Additional context: ${input.trim()}` : "Here are my notes. Please analyze them." },
      ];
    } else if (fileType === "text") {
      userContent = `Here are my notes:\n\n${atob(fileBase64)}${input.trim() ? `\n\nAdditional context: ${input.trim()}` : ""}`;
    } else {
      userContent = input.trim();
    }

    const userMsg = {
      role: "user",
      content: userContent,
      display: uploadedFile ? `[Uploaded: ${uploadedFile.name}]${input.trim() ? " — " + input.trim() : ""}` : input.trim(),
    };

    try {
      const reply = await callAPI(userContent, []);
      const assistantMsg = { role: "assistant", content: reply, display: reply };
      if (isFinalOutput(reply)) setFinalOutput(reply);
      setMessages([userMsg, assistantMsg]);
      setInput("");
      setTimeout(scrollToBottom, 100);
    } catch {
      setMessages([userMsg, { role: "assistant", content: "Something went wrong. Please try again.", display: "Something went wrong. Please try again." }]);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    const userMsg = { role: "user", content: input.trim(), display: input.trim() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput("");
    setTimeout(scrollToBottom, 100);

    try {
      const apiHistory = messages.map((m) => ({ role: m.role, content: m.content }));
      const reply = await callAPI(input.trim(), apiHistory);
      const assistantMsg = { role: "assistant", content: reply, display: reply };
      if (isFinalOutput(reply)) setFinalOutput(reply);
      setMessages([...updatedHistory, assistantMsg]);
      setTimeout(scrollToBottom, 100);
    } catch {
      setMessages([...updatedHistory, { role: "assistant", content: "Something went wrong.", display: "Something went wrong." }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      started ? handleSend() : handleStart();
    }
  };

  const handleReset = () => {
    setMessages([]); setInput(""); setUploadedFile(null);
    setFilePreview(null); setFileBase64(null); setFileType(null);
    setStarted(false); setFinalOutput(null);
  };

  const handleDownload = () => {
    if (!finalOutput) return;
    const blob = new Blob([finalOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "of-note-summary.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F2ED", fontFamily: "'Georgia', 'Times New Roman', serif", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "28px 36px 20px", borderBottom: "1.5px solid #D4C9B8", display: "flex", alignItems: "baseline", justifyContent: "space-between", background: "#FAF8F4" }}>
        <div>
          <span style={{ fontSize: "26px", fontWeight: "700", color: "#1A1410", letterSpacing: "-0.5px", fontStyle: "italic" }}>Of Note</span>
          <span style={{ marginLeft: "14px", fontSize: "13px", color: "#8C7E6E", fontFamily: "'Helvetica Neue', Arial, sans-serif", letterSpacing: "0.3px" }}>your executive note assistant</span>
        </div>
        {started && (
          <button onClick={handleReset} style={{ background: "none", border: "1px solid #C5B8A5", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", color: "#7A6E60", cursor: "pointer", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
            New Session
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: "780px", width: "100%", margin: "0 auto", padding: "0 24px" }}>
        {!started && (
          <div style={{ padding: "40px 0 24px" }}>
            <p style={{ fontSize: "15px", color: "#5C5347", lineHeight: "1.7", fontFamily: "'Helvetica Neue', Arial, sans-serif", marginBottom: "28px", maxWidth: "560px" }}>
              Drop in your notes — an image of a whiteboard, handwritten pages, a text file, or just paste something below. I'll pull out what matters and help you figure out what to do next.
            </p>
            <div onClick={() => fileInputRef.current?.click()} style={{ border: "1.5px dashed #C5B8A5", borderRadius: "10px", padding: "28px", textAlign: "center", cursor: "pointer", background: uploadedFile ? "#EEEAE3" : "transparent", marginBottom: "16px" }}>
              <input ref={fileInputRef} type="file" accept="image/*,.txt,.md" style={{ display: "none" }} onChange={handleFileUpload} />
              {uploadedFile ? (
                <div>
                  {fileType === "image" && filePreview && <img src={filePreview} alt="preview" style={{ maxHeight: "180px", borderRadius: "6px", marginBottom: "10px", objectFit: "contain" }} />}
                  {fileType === "text" && (
                    <div style={{ background: "#F5F2ED", borderRadius: "6px", padding: "12px", maxHeight: "120px", overflow: "hidden", textAlign: "left", fontSize: "12px", color: "#5C5347", fontFamily: "monospace", marginBottom: "10px", whiteSpace: "pre-wrap" }}>
                      {filePreview?.slice(0, 400)}{filePreview?.length > 400 ? "..." : ""}
                    </div>
                  )}
                  <p style={{ fontSize: "13px", color: "#7A6E60", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>{uploadedFile.name} — <span style={{ textDecoration: "underline" }}>swap file</span></p>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>📎</div>
                  <p style={{ fontSize: "14px", color: "#8C7E6E", fontFamily: "'Helvetica Neue', Arial, sans-serif", margin: 0 }}>Upload an image or text file</p>
                  <p style={{ fontSize: "12px", color: "#A89E90", fontFamily: "'Helvetica Neue', Arial, sans-serif", marginTop: "4px" }}>jpg, png, txt, md</p>
                </div>
              )}
            </div>
            <p style={{ fontSize: "12px", color: "#A89E90", fontFamily: "'Helvetica Neue', Arial, sans-serif", textAlign: "center", margin: "0 0 16px" }}>— or just type below —</p>
          </div>
        )}

        {started && (
          <div style={{ flex: 1, overflowY: "auto", padding: "28px 0 16px" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: "20px" }}>
                {m.role === "assistant" && (
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#1A1410", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "#F5F2ED", fontStyle: "italic", flexShrink: 0, marginRight: "12px", marginTop: "2px", fontFamily: "'Georgia', serif" }}>N</div>
                )}
                <div style={{ maxWidth: "88%", background: m.role === "user" ? "#1A1410" : "#FAF8F4", color: m.role === "user" ? "#F5F2ED" : "#1A1410", borderRadius: m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px", padding: "14px 18px", fontSize: "14px", lineHeight: "1.7", fontFamily: m.role === "assistant" ? "'Georgia', serif" : "'Helvetica Neue', Arial, sans-serif", border: m.role === "assistant" ? "1px solid #E0D8CC" : "none", whiteSpace: "pre-wrap" }}>
                  {m.display}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#1A1410", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "#F5F2ED", fontStyle: "italic", fontFamily: "'Georgia', serif" }}>N</div>
                <div style={{ background: "#FAF8F4", border: "1px solid #E0D8CC", borderRadius: "14px 14px 14px 2px", padding: "14px 18px", display: "flex", gap: "6px" }}>
                  {[0, 1, 2].map((d) => <div key={d} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#C5B8A5", animation: "bounce 1.2s infinite", animationDelay: `${d * 0.2}s` }} />)}
                </div>
              </div>
            )}
            {finalOutput && !loading && (
              <div style={{ textAlign: "center", marginTop: "8px", marginBottom: "16px" }}>
                <button onClick={handleDownload} style={{ background: "#1A1410", color: "#F5F2ED", border: "none", borderRadius: "8px", padding: "10px 22px", fontSize: "13px", cursor: "pointer", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                  Download Summary (.txt)
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        <div style={{ padding: "16px 0 28px", borderTop: started ? "1px solid #E0D8CC" : "none", marginTop: started ? "auto" : "0" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", background: "#FAF8F4", border: "1.5px solid #D4C9B8", borderRadius: "12px", padding: "10px 12px" }}>
            {!started && (
              <button onClick={() => fileInputRef.current?.click()} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", padding: "4px", flexShrink: 0, opacity: 0.7 }}>📎</button>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={!started ? "Paste notes here, or add context for an uploaded file…" : "Reply to Of Note…"}
              rows={1}
              style={{ flex: 1, border: "none", background: "transparent", resize: "none", outline: "none", fontSize: "14px", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#1A1410", lineHeight: "1.6", padding: "4px 0", minHeight: "28px", maxHeight: "140px", overflowY: "auto" }}
              onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
            />
            <button
              onClick={started ? handleSend : handleStart}
              disabled={loading || (!input.trim() && !uploadedFile)}
              style={{ background: loading || (!input.trim() && !uploadedFile) ? "#C5B8A5" : "#1A1410", color: "#F5F2ED", border: "none", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", cursor: loading || (!input.trim() && !uploadedFile) ? "not-allowed" : "pointer", fontFamily: "'Helvetica Neue', Arial, sans-serif", flexShrink: 0 }}
            >
              {!started ? "Analyze" : "Send"}
            </button>
          </div>
          <p style={{ fontSize: "11px", color: "#B0A492", fontFamily: "'Helvetica Neue', Arial, sans-serif", textAlign: "center", marginTop: "8px" }}>Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
      <style>{`@keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-5px); opacity: 1; } }`}</style>
    </div>
  );
}
