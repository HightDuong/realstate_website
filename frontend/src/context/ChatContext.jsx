import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { io } from "socket.io-client";
import API_URL from "../config";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const { user, token } = useAuth();

  const [socket, setSocket] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const activeChatRef = useRef(null);

  useEffect(() => {
    setActiveChat(null);
    setNotifications([]);
  }, [user]);

  useEffect(() => {
    if (user && token) {
      // server yêu cầu JWT để kết nối socket (chỉ người trong cuộc trò chuyện mới nghe được tin nhắn)
      const newSocket = io(API_URL, { auth: { token } });

      setSocket(newSocket);

      newSocket.on("receiveMessage", (data) => {
        if (activeChatRef.current?._id !== data.chatId) {
          setNotifications((prev) => [...prev, data]);
        }
      });

      return () => newSocket.close();
    }
  }, [user, token]);

  //to join a chat
  const joinChat = (chatId) => {
    if (socket) {
      socket.emit("joinChat", chatId);
    }
  };

  const sendMessage = (
    chatId,
    text,
    messageId = null,
    createdAt = new Date(),
    image = null,
  ) => {
    if (socket && user) {
      const messageData = {
        chatId,
        sender: user._id,
        text,
        image,
        createdAt,
        _id: messageId,
      };

      socket.emit("sendMessage", messageData);
      return messageData;
    }
    return null;
  };

  return (
    <ChatContext.Provider
      value={{
        socket,
        activeChat,
        setActiveChat,
        joinChat,
        sendMessage,
        notifications,
        setNotifications,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
