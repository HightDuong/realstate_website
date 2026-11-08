import { useEffect, useRef, useState } from "react";
import { chatMessagesStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import API_URL from "../../config";
import Navbar from "../../components/common/Navbar";
import {
  HiChevronLeft,
  HiOutlineChatAlt2,
  HiOutlineTrash,
  HiPaperAirplane,
} from "react-icons/hi";

// Cập nhật danh sách hội thoại khi có tin mới: nối tin vào cuối (để xem trước đúng) và đưa hội thoại lên đầu
const withNewMessage = (chatId, message) => (prev) => {
  const target = prev.find((c) => c._id === chatId);
  if (!target) return prev;
  return [
    { ...target, messages: [...(target.messages || []), message] },
    ...prev.filter((c) => c._id !== chatId),
  ];
};

const ChatMessages = () => {
  const { user, token } = useAuth();
  const location = useLocation();
  const { socket, activeChat, setActiveChat, joinChat, sendMessage } =
    useChat();

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // to scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  //to fetch the conversations ( btw buyer and seller)
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await axios.get(`${API_URL}api/chat/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const fetchedConversations = res.data;
        setConversations(fetchedConversations);

        if (location.state?.chat) {
          const existingChat = fetchedConversations.find(
            (c) => c._id === location.state.chat._id,
          );
          if (existingChat) {
            setActiveChat(existingChat);
          } else {
            setActiveChat(location.state.chat);
          }
        }
        setLoading(false);
      } catch (error) {
        console.error("Tải hội thoại thất bại!", error);
        setLoading(false);
      }
    };
    fetchConversations();
  }, [user, location.state]);

  //to fetch messages
  useEffect(() => {
    if (activeChat) {
      const fetchMessages = async () => {
        try {
          const res = await axios.get(`${API_URL}api/chat/${activeChat._id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setMessages(res.data || []);
          joinChat(activeChat._id);
          scrollToBottom();
        } catch {
          console.error("Không thể tải tin nhắn!");
        }
      };
      fetchMessages();
    }
  }, [activeChat]);

  //cập nhật chat khi tin nhắn mới được gửi
  useEffect(() => {
    if (socket) {
      socket.on("newMessage", (data) => {
        setConversations(withNewMessage(data.chatId, data));
        if (activeChat && data.chatId === activeChat._id) {
          setMessages((prev) => [...prev, data]);
        }
      });
    }
    return () => socket?.off("newMessage");
  }, [socket, activeChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (activeChat) {
      const timer = setTimeout(() => scrollToBottom(), 100);
      return () => clearTimeout(timer);
    }
  }, [activeChat]);

  // to send messages
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    const textToSend = newMessage;
    setNewMessage("");

    try {
      const res = await axios.post(
        `${API_URL}api/chat/send`,
        {
          chatId: activeChat._id,
          text: textToSend,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.data) {
        // Thêm tin nhắn vào state ngay lập tức (optimistic update)
        setMessages((prev) => [...prev, res.data]);
        setConversations(withNewMessage(activeChat._id, res.data));
        sendMessage(
          activeChat._id,
          textToSend,
          res.data._id,
          res.data.createdAt,
        );
      }
      scrollToBottom();
    } catch (error) {
      console.error("Lỗi khi gửi tin nhắn!", error);
      // Khôi phục tin nhắn nếu lỗi
      setNewMessage(textToSend);
      alert(error.response?.data?.message || "Gửi tin nhắn thất bại!");
    }
  };

  //to delete a chat
  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc muốn xóa tin nhắn này chứ?")) return;

    try {
      await axios.delete(`${API_URL}api/chat/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setConversations((prev) => prev.filter((c) => c._id !== chatId));
      if (activeChat?._id === chatId) setActiveChat(null);
    } catch {
      console.error("Lỗi khi xóa chat!");
    }
  };

  //to delete messages from chat
  const handleDeleteMessage = async (chatId, messageId) => {
    if (!window.confirm("Xóa tin nhắn này")) return;

    try {
      const res = await axios.delete(
        `${API_URL}api/chat/${chatId}/message/${messageId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setMessages(res.data.chat.messages);
    } catch (error) {
      console.error("Lỗi xóa tin nhắn!", error);
    }
  };

  //Lấy thông tin đối phương trong cuộc trò chuyện
  // Tài khoản đối phương có thể đã bị xóa (populate trả null) → hiển thị tên thay thế, không làm sập trang
  const getChatPartner = (chat) => {
    const partner = user._id === chat.buyer?._id ? chat.seller : chat.buyer;
    return partner || { name: "Người dùng đã xóa" };
  };

  if (loading)
    return (
      <div className={s.loaderFullPage}>
        <div className={s.loader}></div>
      </div>
    );

  return (
    <div
      className={`${s.chatContainer} ${
        user?.role === "seller"
          ? s.chatContainerSeller
          : s.chatContainerNonSeller
      }`}
    >
      {user?.role !== "seller" && <Navbar />}

      <div className={s.chatWrapper}>
        <div className={`${s.sidebar} ${activeChat ? s.sidebarHidden : ""}`}>
          <div className={s.sidebarHeader}>
            <h2 className={s.sidebarTitle}>Tin nhắn</h2>
          </div>

          <div className={s.sidebarContent}>
            {conversations.length === 0 ? (
              <div className={s.emptyConversations}>
                <HiOutlineChatAlt2 className={s.emptyIcon} />
                <p>Không có trò chuyện gần đây</p>
              </div>
            ) : (
              conversations.map((chat) => (
                <div
                  key={chat._id}
                  className={`${s.conversationItem} ${
                    activeChat?._id === chat._id ? s.conversationItemActive : ""
                  }`}
                  onClick={() => setActiveChat(chat)}
                >
                  <div className={s.avatar}>
                    {getChatPartner(chat)?.profilePic ? (
                      <img
                        src={getChatPartner(chat).profilePic}
                        className={s.avatarImg}
                        alt=""
                      />
                    ) : (
                      getChatPartner(chat)?.name?.charAt(0)
                    )}
                  </div>

                  <div className={s.conversationInfo}>
                    <div className={s.conversationName}>
                      {getChatPartner(chat)?.name}
                    </div>
                    <div className="truncate text-[0.7rem] font-medium text-primary">
                      {chat.property?.title || "Tin đăng đã bị xóa"}
                    </div>
                    <div className={s.conversationPreview}>
                      {chat.messages.at(-1)?.text || "Bắt đầu cuộc trò chuyện"}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteChat(e, chat._id)}
                    className={s.deleteChatButton}
                    title="Xóa cuộc trò chuyện"
                  >
                    <HiOutlineTrash />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* main chat area */}
        <div className={s.chatArea}>
          {activeChat ? (
            <>
              <div className={s.chatHeader}>
                <div className={s.chatHeaderLeft}>
                  <button
                    className={s.backButton}
                    onClick={() => setActiveChat(null)}
                  >
                    <HiChevronLeft size={24} />
                  </button>

                  <div className={s.avatar}>
                    {getChatPartner(activeChat)?.profilePic ? (
                      <img
                        className={s.avatarImg}
                        src={getChatPartner(activeChat).profilePic}
                        alt=""
                      />
                    ) : (
                      getChatPartner(activeChat)?.name?.charAt(0)
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className={s.chatPartnerName}>
                      {getChatPartner(activeChat)?.name}
                    </div>
                    {/* cho biết cuộc trò chuyện đang về tin đăng nào */}
                    {activeChat.property ? (
                      <Link
                        to={`/property/${activeChat.property._id}`}
                        className="block truncate text-xs text-primary hover:underline"
                      >
                        {activeChat.property.title}
                      </Link>
                    ) : (
                      <span className="block text-xs text-[#94a3b8]">
                        Tin đăng đã bị xóa
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className={s.messagesArea}>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`${s.messageBubble} ${
                      (msg.sender?._id || msg.sender) === user._id
                        ? s.messageOwn
                        : s.messageOther
                    }`}
                  >
                    <div className={s.messageContent}>
                      {msg.image && (
                        <div className={s.messageImageWrapper}>
                          <img
                            src={msg.image}
                            alt="Hình ảnh bất động sản"
                            className={s.messageImage}
                          />
                        </div>
                      )}

                      <div className={s.messageText}>{msg.text}</div>

                      {(msg.sender?._id || msg.sender) === user._id && (
                        <button
                          className={s.deleteMessageButton}
                          onClick={() =>
                            handleDeleteMessage(activeChat._id, msg._id)
                          }
                          title="Xóa tin nhắn"
                        >
                          <HiOutlineTrash size={14} />
                        </button>
                      )}
                    </div>

                    <span className={s.messageTime}>
                      {new Date(msg.createdAt).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>

              <form className={s.messageForm} onSubmit={handleSendMessage}>
                <input
                  type="text"
                  className={s.messageInput}
                  placeholder="Nhập tin nhắn..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />

                <button type="submit" className={s.sendButton}>
                  <HiPaperAirplane className={s.sendIcon} />
                </button>
              </form>
            </>
          ) : (
            <div className={s.noChatSelected}>
              <HiOutlineChatAlt2 className={s.noChatIcon} />

              <h3 className={s.noChatTitle}>Tin nhắn của bạn</h3>

              <p>Chọn một cuộc trò chuyện để bắt đầu nhắn tin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessages;
