// Giới hạn số request theo IP (lưu trong bộ nhớ, đủ dùng cho 1 instance trên Render).
// Nhiều instance thì cần chuyển sang Redis.
// skipSuccessful: chỉ đếm request thất bại (status >= 400), vd đăng nhập sai
export const rateLimit = ({ windowMs, max, message, keyFn, skipSuccessful = false }) => {
  const hits = new Map();

  // dọn các khóa đã hết hạn để Map không phình mãi
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    if (entry.count >= max) {
      res.set("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ code: "TOO_MANY_REQUESTS", message });
    }
    entry.count += 1;
    if (skipSuccessful) {
      res.on("finish", () => {
        if (res.statusCode < 400 && entry.count > 0) entry.count -= 1;
      });
    }
    next();
  };
};
