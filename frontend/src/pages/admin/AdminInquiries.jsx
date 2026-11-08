import React, { useEffect, useState } from "react";
import { adminInquiriesStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import axios from "axios";
import API_URL from "../../config";
import {
  HiOutlineAnnotation,
  HiOutlineCalendar,
  HiOutlineHome,
} from "react-icons/hi";

const AdminInquiries = () => {
  const [inquiries, setInquiries] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  //lấy các yêu cầu liên hệ do người mua gửi cho người bán
  useEffect(() => {
    const fetchInquiries = async () => {
      if (!token) return;
      setLoading(true);
      try {
        console.log("Đang tải yêu cầu...");
        const res = await axios.get(`${API_URL}api/admin/inquiries`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log("Yêu cầu trả về : ", res.data);
        if (res.data.success) {
          setInquiries(res.data.inquiries);
        }
        setLoading(false);
      } catch (error) {
        console.error("Tải yêu cầu thất bại:", error);
        setError(error.response?.data?.message || error.message);
        setLoading(false);
      }
    };
    fetchInquiries();
  }, [token]);

  if (loading)
    return (
      <div className="loader-full-page">
        <div className="loader"></div>
      </div>
    );

  if (error)
    return (
      <div className="error-container p-8 text-center text-[#dc2626]">
        <h3>Lỗi khi tải yêu cầu liên hệ</h3>
        <p>{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Thử lại
        </button>
      </div>
    );
  return (
    <>
      <div className={s.headerContainer}>
        <h1 className={s.headerTitle}>Yêu cầu liên hệ trên nền tảng</h1>
        <p className={s.headerSubtitle}>
          Xem trò chuyện giữa người mua và người bán
        </p>
      </div>
      <div className={s.listContainer}>
        {inquiries.map((inq) => (
          <div key={inq._id} className={s.inquiryCard}>
            <div className={s.cardTopSection}>
              <div className={s.propertyInfoWrapper}>
                <div className={s.propertyIconWrapper}>
                  <HiOutlineHome size={24} />
                </div>
                <div className={s.propertyTextWrapper}>
                  <div className={s.propertyTitle}>
                    {inq.property?.title || "Bất động sản không xác định"}
                  </div>
                  <div className={s.propertyId}>
                    ID BĐS : {inq.property?._id}
                  </div>
                </div>
              </div>
              <div className={s.dateWrapper}>
                <HiOutlineCalendar className={s.dateIcon} />{" "}
                {new Date(inq.createdAt).toLocaleDateString("vi-VN")}
              </div>
            </div>
            <div className={s.detailsGrid}>
              <div className={s.detailCard}>
                <div className={s.detailLabel}>Thông tin người mua</div>
                <div className={s.detailName}>{inq.buyer?.name}</div>
                <div className={s.detailEmail}>{inq.buyer?.email}</div>
              </div>

              <div className={s.detailCard}>
                <div className={s.detailLabel}>Thông tin người bán</div>
                <div className={s.detailName}>{inq.seller?.name}</div>
                <div className={s.detailEmail}>{inq.seller?.email}</div>
              </div>
            </div>
            <div className={s.messageContainer}>
              <div className={s.messageHeader}>
                <HiOutlineAnnotation />
                Tin nhắn
              </div>
              <p className={s.messageText}>"{inq.message}"</p>
            </div>
          </div>
        ))}

        {inquiries.length === 0 && (
          <div className={s.emptyState}>
            <div className={s.emptyIconWrapper}>
              <HiOutlineAnnotation size={48} className="mx-auto" />
            </div>
            <h2>Không tìm thấy yêu cầu liên hệ</h2>
            <p className={s.emptyText}>
              Hiện chưa có dữ liệu về các yêu cầu tư vấn.
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminInquiries;
