import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

const STORAGE_KEY = "personal-ai-chat-conversations";

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now()
  };
}

function loadConversations(): Conversation[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    console.warn("Could not load saved conversations.");
  }

  return [createConversation()];
}

export default function App() {
  const [conversations, setConversations] =
    useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState(() => conversations[0].id);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeId) ??
    conversations[0];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation.messages]);

  function startNewChat() {
    const conversation = createConversation();

    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setInput("");
  }

  function deleteConversation(id: string) {
    const remaining = conversations.filter(
      (conversation) => conversation.id !== id
    );

    const next = remaining.length > 0 ? remaining : [createConversation()];

    setConversations(next);

    if (id === activeId) {
      setActiveId(next[0].id);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (!text || isLoading) {
      return;
    }

    const conversationId = activeConversation.id;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text
    };

    const assistantId = crypto.randomUUID();

    const history = [...activeConversation.messages, userMessage];

    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: ""
    };

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title:
                conversation.messages.length === 0
                  ? text.slice(0, 40)
                  : conversation.title,
              messages: [...history, assistantMessage],
              updatedAt: Date.now()
            }
          : conversation
      )
    );

    setInput("");
    setIsLoading(true);

    let assistantText = "";

    const updateAssistantMessage = () => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: Date.now(),
                messages: conversation.messages.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: assistantText }
                    : message
                )
              }
            : conversation
        )
      );
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({
            role,
            content
          }))
        })
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Request failed with ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Streaming is not supported by this browser.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processLine = (line: string) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return;
        }

        const data = JSON.parse(trimmed);

        if (data.error) {
          throw new Error(data.error);
        }

        if (typeof data.message?.content === "string") {
          assistantText += data.message.content;
          updateAssistantMessage();
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          processLine(line);
        }
      }

      buffer += decoder.decode();
      processLine(buffer);

      if (!assistantText.trim()) {
        throw new Error("The model returned an empty response.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred.";

      assistantText = assistantText
        ? `${assistantText}\n\nError: ${message}`
        : `Error: ${message}`;

      updateAssistantMessage();
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-72 flex-col border-r border-slate-800 bg-slate-900/70 p-4 md:flex">
        <button
          type="button"
          onClick={startNewChat}
          className="rounded-xl bg-indigo-500 px-4 py-3 font-medium text-white transition hover:bg-indigo-400"
        >
          + New chat
        </button>

        <div className="mt-5 flex-1 space-y-2 overflow-y-auto">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group flex items-center rounded-lg ${
                conversation.id === activeId
                  ? "bg-slate-700"
                  : "hover:bg-slate-800"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveId(conversation.id)}
                className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
              >
                {conversation.title}
              </button>

              <button
                type="button"
                aria-label={`Delete ${conversation.title}`}
                onClick={() => deleteConversation(conversation.id)}
                className="px-3 text-slate-400 hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Local model: llama3.2:3b
          <br />
          Chats are stored in this browser.
        </p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h1 className="font-semibold">Personal AI</h1>
            <p className="text-xs text-slate-400">Private local chat</p>
          </div>

          <button
            type="button"
            onClick={startNewChat}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm md:hidden"
          >
            New chat
          </button>
        </header>

        <section className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8">
            {activeConversation.messages.length === 0 ? (
              <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500 text-3xl">
                  ✦
                </div>
                <h2 className="text-2xl font-semibold">
                  What can I help with?
                </h2>
                <p className="mt-2 text-slate-400">
                  Ask a question to start your private conversation.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {activeConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 leading-7 ${
                        message.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-100"
                      }`}
                    >
                      {message.content ||
                        (isLoading && message.role === "assistant"
                          ? "Thinking…"
                          : "")}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </section>

        <footer className="border-t border-slate-800 p-4">
          <form
            onSubmit={sendMessage}
            className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-3"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message your personal AI…"
              rows={1}
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-slate-100 placeholder-slate-500 outline-none"
            />

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-indigo-500 px-5 py-3 font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? "Wait" : "Send"}
            </button>
          </form>

          <p className="mt-2 text-center text-xs text-slate-500">
            Enter to send · Shift + Enter for a new line
          </p>
        </footer>
      </main>
    </div>
  );
}
