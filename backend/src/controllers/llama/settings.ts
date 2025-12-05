import { Settings } from "llamaindex";
import { HuggingFaceEmbedding } from "@llamaindex/huggingface";

if (!Settings.embedModel) {
  Settings.embedModel = new HuggingFaceEmbedding({
    modelType: "Xenova/all-MiniLM-L6-v2", // același ca în generate.mjs
    quantized: true,
  });
}

export {};
