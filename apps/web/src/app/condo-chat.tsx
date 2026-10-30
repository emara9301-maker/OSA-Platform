"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Avatar } from "./avatar";
import type { ChatMessage } from "@/lib/condo-chat";
import { t, type Lang } from "@/lib/messages";
import { createBrowserSupabase } from "@/lib/supabase-browser";

// The condo chat, in a panel beside the page. New messages arrive live; each change refreshes the list from the server.
export function CondoChat({
  lang,
  condoId,
  meId,
  messages,
  canPost,
  canDelete,
}: {
  lang: Lang;
  condoId: string;
  meId: string;
  messages: ChatMessage[];
  canPost: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  // On phones the chat opens from a round button; on wide screens it is always shown beside the page.
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const client = createBrowserSupabase();
    const channel = client
      .channel(`condo-chat-${condoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "condo_messages" }, () => router.refresh())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [condoId, router]);

  // Keep the newest message in view.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, [messages]);

  // On a computer, Enter sends and Shift+Enter starts a new line. On phones Enter keeps its usual meaning.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    if (!window.matchMedia("(pointer: fine)").matches) {
      return;
    }
    event.preventDefault();
    void sendText();
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendText();
  }

  async function sendText() {
    const text = body.trim();
    if (!text) {
      return;
    }
    setError(null);
    const { error: sendError } = await createBrowserSupabase().rpc("post_condo_message", { p_condo_id: condoId, p_body: text });
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setBody("");
    router.refresh();
  }

  async function remove(messageId: string) {
    setError(null);
    const { error: deleteError } = await createBrowserSupabase().rpc("delete_condo_message", { p_message_id: messageId });
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button type="button" className="chat-fab" aria-label={t(lang, "chatTitle")} onClick={() => setOpen(true)}>
        💬
      </button>

    <section className={open ? "chat chat-open" : "chat"}>
      <div className="chat-head">
        <div>
          <h2>{t(lang, "chatTitle")}</h2>
          <p>{t(lang, "chatNote")}</p>
        </div>
        <button type="button" className="chat-close" aria-label={t(lang, "chatClose")} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {error && <p role="alert">{error}</p>}
        {messages.length === 0 ? (
          <p className="chat-empty">{t(lang, "chatEmpty")}</p>
        ) : (
          <ul className="chat-list">
            {messages.map((message) => {
              const mine = message.authorId === meId;
              return (
                <li key={message.id} className={mine ? "chat-row chat-row-mine" : "chat-row"}>
                  {!mine && <Avatar name={message.username} photoUrl={message.photoUrl} />}
                  <div className={mine ? "chat-bubble chat-bubble-mine" : "chat-bubble"}>
                    {!mine && <p className="chat-name">{message.username}</p>}
                    <p className="chat-text">{message.body}</p>
                    <span className="chat-time">{message.time}</span>
                  </div>
                  {canDelete && (
                    <button type="button" className="chat-delete" onClick={() => void remove(message.id)}>
                      {t(lang, "chatDelete")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {canPost && (
        <form className="chat-form" onSubmit={send}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={1000}
            rows={1}
            placeholder={t(lang, "chatPlaceholder")}
            aria-label={t(lang, "chatPlaceholder")}
          />
          <button type="submit" aria-label={t(lang, "chatSend")}>
            ➤
          </button>
        </form>
      )}
    </section>
    </>
  );
}
