import { useEffect, useState } from "react";
import { buyerInquiryTone, myInquiriesStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import { Link } from "react-router-dom";
import axios from "axios";
import API_URL from "../../config";
import Navbar from "../../components/common/Navbar";
import SellerInquiries from "../seller/SellerInquiries";
import { BUYER_INQUIRY_STATUS_LABELS } from "../../utils/propertyLabels";
import {
  HiCalendar,
  HiCheckCircle,
  HiExternalLink,
  HiHome,
  HiOutlineChatAlt2,
} from "react-icons/hi";

// Mô tả ngắn dưới mỗi yêu cầu theo trạng thái phía người mua
const BUYER_STATUS_HINTS = {
  sent: "Đợi người bán xem yêu cầu",
  seen: "Người bán đã xem, sắp liên hệ với bạn",
  contacted: "Người bán đã phản hồi, xem trong Tin nhắn",
  viewing_scheduled: "Đã hẹn lịch xem nhà",
  closed: "Yêu cầu đã kết thúc",
};

// Trang yêu cầu tư vấn của người mua (seller dùng trang "Khách hàng" riêng)
const MyInquires = () => {
  const { user, token } = useAuth();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Lấy danh sách yêu cầu liên hệ (inquiry) từ phía server
  useEffect(() => {
    const fetchInquiries = async () => {
      if (!user) return;
      try {
        const res = await axios.get(`${API_URL}api/inquiry/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setInquiries(res.data.inquiries || []);
        setLoading(false);
      } catch (error) {
        console.error("Lỗi khi lấy dữ liệu!", error);
        setError(
          error.response?.data?.message || "Lỗi khi tải dữ liệu / tải trang ",
        );
        setLoading(false);
      }
    };
    fetchInquiries();
  }, [user, token]);

  if (loading)
    return (
      <div className={s.loaderFullPage}>
        <div className={s.loader}></div>
      </div>
    );

  if (error)
    return (
      <div className={s.bgBgAltMinH}>
        <Navbar />
        <div className={s.containerPy12TextCenter}>
          <div className={s.cardPremiumPy16Px8}>
            <h2 className={s.textDangerMb4}>Lỗi</h2>
            <p className={s.mb8}>{error}</p>
            <button
              onClick={() => window.location.reload()}
              className={s.btnPrimary}
            >
              Thử lại
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className={s.bgBgAltMinH}>
      <Navbar />
      <div className={`${s.containerFadeIn} ${s.py12Pt12}`}>
        <div className={s.mb12}>
          <h1 className={s.heading}>Yêu cầu của tôi</h1>
          <p className={s.textMuted}>
            Theo dõi trạng thái các yêu cầu tư vấn BĐS của bạn
          </p>
        </div>

        {inquiries.length === 0 ? (
          <div className={s.cardPremiumPy24Px8TextCenter}>
            <div className={s.iconContainer}>
              <HiOutlineChatAlt2 size={40} />
            </div>
            <h2 className={s.mb4}>Không có yêu cầu nào đã gửi</h2>
            <p className={s.textMutedMb8}>
              Bạn chưa liên hệ người bán nào. Đang quan tâm bất động sản? Hãy
              gửi yêu cầu ngay!
            </p>
            <Link to="/properties" className={s.btnPrimary}>
              Tìm kiếm bất động sản
            </Link>
          </div>
        ) : (
          <div className={s.flexColGap6}>
            {inquiries.map((inq) => {
              const status = inq.buyerStatus || (inq.isRead ? "seen" : "sent");
              return (
                <div key={inq._id} className={s.inquiryCard}>
                  <div className={s.inquiryMain}>
                    <div className={s.iconWrapper}>
                      <HiHome className={s.iconSize} />
                    </div>
                    <div className={s.flex1}>
                      <div className={s.titleRow}>
                        <h3 className={s.titleText}>
                          {inq.property?.title || "Tin đăng đã bị xóa"}
                        </h3>
                        <span className={`${s.badge} ${buyerInquiryTone(status)}`}>
                          {BUYER_INQUIRY_STATUS_LABELS[status]}
                        </span>
                      </div>

                      <p className={s.message}>"{inq.message}"</p>
                      <div className={s.meta}>
                        <div className={s.flexItemsCenterGap2}>
                          <HiCalendar size={16} /> Đã gửi ngày{" "}
                          {new Date(inq.createdAt).toLocaleDateString("vi-VN")}
                        </div>
                        <div className={s.flexItemsCenterGap2}>
                          <HiCheckCircle size={16} /> {BUYER_STATUS_HINTS[status]}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={s.actions}>
                    {inq.property && (
                      <Link
                        to={`/property/${inq.property._id}`}
                        className={s.btnOutline}
                      >
                        Xem BĐS <HiExternalLink />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// /inquiries dùng chung một route: seller thấy trang "Khách hàng", người mua thấy yêu cầu đã gửi
const InquiriesPage = () => {
  const { user } = useAuth();
  return user?.role === "seller" ? <SellerInquiries /> : <MyInquires />;
};

export default InquiriesPage;
