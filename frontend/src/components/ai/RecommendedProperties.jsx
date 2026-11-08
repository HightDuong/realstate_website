import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { HiChatAlt2, HiSparkles, HiStar } from "react-icons/hi";
import API_URL from "../../config";
import { useAuth } from "../../context/AuthContext";
import { recommendationStyles as s } from "../../assets/dummyStyles";
import PropertyCard from "../common/PropertyCard";
import { AI_INTEREST_EVENT, OPEN_AI_CHAT_EVENT } from "./aiChatConfig";

const MAX_ITEMS = 5;

/**
 * Mục gợi ý đầu trang /properties, 2 chế độ (backend quyết định):
 *  - "chat": chỉ các tin trợ lý AI tìm được cho nhu cầu mới nhất trong phiên chat hiện tại (1–5 tin).
 *  - "featured": chưa chat / phiên mới → tin nổi bật, chấm điểm theo giá/m², độ hoàn thiện,
 *    lượt quan tâm, độ mới, kiểm duyệt; mỗi thẻ kèm lý do.
 */
const RecommendedProperties = ({ wishlistedIds = [], onToggleWishlist }) => {
  const { token } = useAuth();
  const [data, setData] = useState({ mode: null, properties: [], basedOn: "" });
  // lần đầu đang tải; các lần cập nhật sau (sau khi chat) tải ngầm, giữ gợi ý cũ
  const [loading, setLoading] = useState(true);

  const fetchRecommendations = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}api/ai/recommendations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setData({
        mode: res.data.mode || "featured",
        properties: (res.data.properties || []).slice(0, MAX_ITEMS),
        basedOn: res.data.basedOn || "",
      });
    } catch {
      // gợi ý là phần phụ: lỗi thì ẩn đi, không làm ảnh hưởng trang
      setData({ mode: null, properties: [], basedOn: "" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!cancelled) fetchRecommendations();
    };
    // gọi qua microtask để không setState đồng bộ trong effect
    Promise.resolve().then(load);
    // Trò chuyện xong / mở phiên mới → cập nhật gợi ý ngay
    window.addEventListener(AI_INTEREST_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(AI_INTEREST_EVENT, load);
    };
  }, [fetchRecommendations]);

  const handleDismiss = async () => {
    if (!window.confirm("Xóa các gợi ý dựa trên cuộc trò chuyện của bạn?")) return;
    try {
      await axios.delete(`${API_URL}api/ai/recommendations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchRecommendations(); // quay về "Gợi ý nổi bật"
    } catch (error) {
      alert(error.response?.data?.message || "Không xóa được gợi ý");
    }
  };

  if (!loading && data.properties.length === 0) return null;

  const isChat = data.mode === "chat";
  const count = data.properties.length;
  // Phiên chat tìm được ít tin → thêm ô mời hỏi tiếp thay vì lấp bằng tin không liên quan
  const showAskTile = isChat && count < MAX_ITEMS;

  return (
    <section
      className={s.section}
      aria-label={isChat ? "Có thể bạn quan tâm" : "Gợi ý nổi bật"}
    >
      <div className={s.header}>
        <div>
          {isChat || loading ? (
            <span className={s.badge}>
              <HiSparkles size={14} /> Có thể bạn quan tâm
            </span>
          ) : (
            <span className={s.badgeFeatured}>
              <HiStar size={14} /> Gợi ý nổi bật
            </span>
          )}
          {isChat && data.basedOn && (
            <p className={s.basedOn}>
              {count} tin phù hợp với nhu cầu trong phiên trò chuyện với trợ lý AI:{" "}
              <span className={s.basedOnQuery}>“{data.basedOn}”</span>
            </p>
          )}
          {!isChat && !loading && (
            <p className={s.basedOn}>
              Xếp hạng bằng cách so sánh giá/m² với mặt bằng khu vực, độ đầy đủ của tin,
              lượt quan tâm, độ mới và trạng thái kiểm duyệt.
            </p>
          )}
        </div>
        {isChat && token && (
          <button type="button" onClick={handleDismiss} className={s.dismiss}>
            Xóa gợi ý
          </button>
        )}
      </div>

      <div className={s.scroller}>
        {loading && count === 0
          ? [0, 1, 2].map((i) => <div key={i} className={s.skeleton} />)
          : data.properties.map((p, i) => (
              <div key={p._id} className={s.item}>
                <span className={s.rank}>{i + 1}</span>
                {p.highlight && <span className={s.highlight}>{p.highlight}</span>}
                <PropertyCard
                  property={p}
                  isWishlisted={wishlistedIds.includes(String(p._id))}
                  onToggleWishlist={onToggleWishlist}
                />
              </div>
            ))}
        {!loading && showAskTile && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_AI_CHAT_EVENT))}
            className={s.askTile}
          >
            <span className={s.askIcon}>
              <HiChatAlt2 size={26} />
            </span>
            <span className={s.askTitle}>Muốn thêm lựa chọn?</span>
            <span className={s.askText}>
              Hỏi RealEstate để nới điều kiện (khu vực, ngân sách, loại hình) và nhận
              thêm gợi ý phù hợp.
            </span>
            <span className={s.askCta}>Hỏi RealEstate →</span>
          </button>
        )}
      </div>
    </section>
  );
};

export default RecommendedProperties;
