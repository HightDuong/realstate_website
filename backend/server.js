import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import app, { allowedOrigins } from "./app.js";
import { registerChatSocket } from "./utils/chatSocket.js";
import { setSocketServer } from "./utils/notify.js";

const PORT = process.env.PORT || 5000;

// ====================== CONNECT DATABASE ======================
connectDB();
console.log("✅ Allowed Origins:", allowedOrigins);

// ====================== SERVER & SOCKET.IO ======================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Xác thực JWT + kiểm tra người tham gia chat (xem utils/chatSocket.js)
registerChatSocket(io);
// Thông báo realtime gửi tới phòng riêng của từng user (xem utils/notify.js)
setSocketServer(io);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
