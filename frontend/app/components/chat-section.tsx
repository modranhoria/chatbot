"use client";

import { useChat } from "ai/react";
import { useEffect, useMemo, useState } from "react";
import { Session } from "next-auth";
import { signIn, signOut, useSession } from "next-auth/react";
import { insertDataIntoMessages } from "./transform";
import { ChatInput, ChatMessages } from "./ui/chat";

export default function ChatSection() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="max-w-5xl w-full text-center text-gray-600">
        Loading session...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-5xl w-full flex flex-col items-center gap-4">
        <p className="text-lg text-gray-700">
          You need to be authentificated to be able to use the ChatBot.
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => signIn("google")}
            className="px-5 py-2 rounded-xl bg-red-500 text-white font-semibold shadow"
          >
            Google Login
          </button>
          <button
            onClick={() => signIn("github")}
            className="px-5 py-2 rounded-xl bg-gray-800 text-white font-semibold shadow"
          >
            Github Login
          </button>
        </div>
      </div>
    );
  }

  return <AuthenticatedChat session={session} />;
}

type AuthenticatedChatProps = {
  session: Session;
};

function AuthenticatedChat({ session }: AuthenticatedChatProps) {
  const chatApi =
    process.env.NEXT_PUBLIC_CHAT_API?.trim() || "/api/chat";
  const userId =
    (session.user as { id?: string })?.id ?? session.user?.email ?? "unknown";

  const [historyLoaded, setHistoryLoaded] = useState(false);

  const {
    messages,
    input,
    isLoading,
    handleSubmit,
    handleInputChange,
    reload,
    stop,
    data,
    setMessages,
  } = useChat({
    api: chatApi,
    body: {
      userId,
    },
  });

  useEffect(() => {
    setHistoryLoaded(false);
  }, [userId, chatApi]);

  useEffect(() => {
    if (!userId || historyLoaded) return;

    async function loadHistory() {
      try {
        const base =
          chatApi.startsWith("http")
            ? new URL(chatApi).origin
            : "";
        const url = `${base}/api/history?userId=${encodeURIComponent(userId)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const payload = await res.json();
        if (Array.isArray(payload.history) && payload.history.length > 0) {
          setMessages(payload.history);
        }
      } catch {
        // ignore history load errors
      } finally {
        setHistoryLoaded(true);
      }
    }
    loadHistory();
  }, [chatApi, historyLoaded, setMessages, userId]);

  const transformedMessages = useMemo(
    () => insertDataIntoMessages(messages, data),
    [messages, data],
  );

  return (
    <div className="space-y-4 max-w-5xl w-full">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          Authentificated as {" "}
          <span className="font-semibold">{session.user?.email}</span>
        </p>
        <button
          onClick={() => signOut()}
          className="text-sm text-red-500 underline"
        >
          Logout
        </button>
      </div>

      <ChatMessages
        messages={transformedMessages}
        isLoading={isLoading}
        reload={reload}
        stop={stop}
      />
      <ChatInput
        input={input}
        handleSubmit={handleSubmit}
        handleInputChange={handleInputChange}
        isLoading={isLoading}
        multiModal={process.env.NEXT_PUBLIC_MODEL === "gpt-4-vision-preview"}
      />
    </div>
  );
}
