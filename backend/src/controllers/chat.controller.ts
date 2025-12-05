import { Request, Response } from "express";
import { OpenAIStream, streamToResponse } from "ai";
import OpenAI from "openai";
import { getRagContext, RagResult } from "./engine";
import { appendHistory } from "./historyStore";

type Role = "system" | "user" | "assistant";

interface ChatMessage {
  role: Role;
  content: string;
}

export const chat = async (req: Request, res: Response) => {
  try {
    const {
      messages,
      data,
      userId,
    }: { messages: ChatMessage[]; data: any; userId: string } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ error: "Missing userId — login required!" });
    }

    if (!messages || messages.length === 0) {
      return res.status(400).json({
        error: "messages are required in the request body",
      });
    }

    const last = messages[messages.length - 1];
    if (last.role !== "user") {
      return res.status(400).json({
        error: "the last message must be from the user",
      });
    }

    if (!process.env.MISTRAL_API_KEY) {
      return res.status(500).json({
        error: "MISTRAL_API_KEY is not set",
      });
    }

    const question = last.content;

    // Retrieve RAG context for the latest user question
    const rag: RagResult = await getRagContext(question);
    const { context } = rag;

    const systemPrompt =
      "You are an assistant that must answer in the same language as the user's question (default to English if unclear). " +
      "Use ONLY the provided CONTEXT. If the answer is not in the context, reply: \"I cannot find this information in the uploaded documents.\" " +
      "Be concise (2-3 sentences). Do not fabricate or add external information.";

    const contextMessage = context
      ? `CONTEXT START\n${context}\nCONTEXT END`
      : "Nu exista context relevant din documente pentru intrebarea de mai sus.";

    const mistralMessages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: contextMessage },
      ...messages.slice(0, -1),
      last,
    ];

    const mistral = new OpenAI({
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
    });

    const model = process.env.MISTRAL_MODEL || "mistral-small-latest";

    console.log("[Mistral chat] model:", model);

    const completion = await mistral.chat.completions.create({
      model,
      messages: mistralMessages as any,
      stream: true,
    });

    let finalAnswer = "";

    const stream = OpenAIStream(completion, {
      experimental_streamData: true,
      onToken: (t) => (finalAnswer += t),
      onFinal: async () => {
        // Persist conversation history
        await appendHistory(userId, [
          ...messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: new Date().toISOString(),
          })),
          {
            role: "assistant",
            content: finalAnswer,
            timestamp: new Date().toISOString(),
          },
        ]);

        return {
          imageUrl: data?.imageUrl ?? null,
          usedRag: !!context,
        };
      },
    });

    return streamToResponse(stream, res, {
      headers: {
        "X-Experimental-Stream-Data": "true",
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Expose-Headers": "X-Experimental-Stream-Data",
      },
    });
  } catch (error) {
    console.error("[Mistral chat controller]", error);
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
};
