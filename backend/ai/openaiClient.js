import OpenAI from "openai";

// Có thể đổi model qua biến môi trường mà không cần sửa code
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
// Chat Completions không cho dùng function tools kèm reasoning trên gpt-5.4-mini
// (lỗi 400 "set reasoning_effort to 'none'"), nên mặc định "none" — cũng giúp trả lời nhanh hơn.
// Để trống OPENAI_REASONING_EFFORT nếu đổi sang model không có tham số này (vd. gpt-4.1).
export const REASONING_EFFORT =
  process.env.OPENAI_REASONING_EFFORT === undefined
    ? "none"
    : process.env.OPENAI_REASONING_EFFORT || null;

export const isAiEnabled = () =>
  Boolean(process.env.OPENAI_API_KEY) && process.env.AI_ENABLED !== "false";

let client = null;

// Khởi tạo lười để server vẫn chạy được khi chưa cấu hình OPENAI_API_KEY
export const getOpenAI = () => {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
};
