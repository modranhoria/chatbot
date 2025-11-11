import { streamToResponse } from "ai";
import { Request, Response } from "express";
import { ChatMessage, MessageContent, OpenAI, type LLM } from "llamaindex";
import { createChatEngine } from "./engine";
import { LlamaIndexStream } from "./llamaindex-stream";

const convertMessageContent = (
  textMessage: string,
  imageUrl: string | undefined,
): MessageContent => {
  if (!imageUrl) return textMessage;
  return [
    { type: "text", text: textMessage },
    {
      type: "image_url",
      image_url: { url: imageUrl },
    },
  ];
};

export const chat = async (req: Request, res: Response) => {
  try {
    const { messages, data }: { messages: ChatMessage[]; data: any } = req.body;
    const userMessage = messages.pop();
    if (!messages || !userMessage || userMessage.role !== "user") {
      return res.status(400).json({
        error:
          "messages are required in the request body and the last message must be from the user",
      });
    }

    // Use Hugging Face Inference API via its OpenAI-compatible endpoint
    const llm: LLM = new OpenAI({
      // Override via HF_MODEL to pick any HF chat model
      model: "openai/gpt-oss-20b:groq",
      // Prefer HF_TOKEN, fallback to HUGGINGFACEHUB_API_TOKEN for flexibility
      apiKey: process.env.HF_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN,
      // Hugging Face OpenAI-compatible base URL
      baseURL:"https://api-inference.huggingface.co/v1"
    });

    const chatEngine = await createChatEngine(llm);
10
    const userMessageContent = convertMessageContent(
      userMessage.content,
      data?.imageUrl,
    );

    console.log("newMessage", userMessageContent);
    console.log("chathistory", messages);

    const response = await chatEngine.chat({
      message: userMessageContent,
      chatHistory: messages,
      stream: true,
    });

    const { stream, data: streamData } = LlamaIndexStream(response, {
      parserOptions: { image_url: data?.imageUrl },
    });

    const processedStream = stream.pipeThrough(streamData.stream);
    return streamToResponse(processedStream, res, {
      headers: {
        "X-Experimental-Stream-Data": "true",
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Expose-Headers": "X-Experimental-Stream-Data",
      },
    });
  } catch (error) {
    console.error("[LlamaIndex]", error);
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
};
