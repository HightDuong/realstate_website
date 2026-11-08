import React, { useEffect, useState } from "react";
import { sellerRequestsStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import axios from "axios";
import API_URL from "../../config";
import {
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineMail,
  HiOutlinePhone,
} from "react-icons/hi";

const SellerRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  //to fetch the request ( seller)
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await axios.get(`${API_URL}api/admin/pending-sellers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success) {
          setRequests(res.data.pendingSellers);
        }
        setLoading(false);
      } catch (error) {
        console.error("Tải yêu cầu Seller thất bại!", error);
        setLoading(false);
      }
    };
    fetchRequests();
  }, [token]);

  // to approve a seller
  const handleApprove = async (id) => {
    try {
      const res = await axios.patch(
        `${API_URL}api/admin/approve-seller/${id}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.data.success) {
        setRequests(requests.filter((req) => req._id !== id));
        alert("Duyệt thành công!");
      }
    } catch (error) {
      alert("Duyệt thất bại!");
    }
  };

  if (loading)
    return (
      <div className={s.loaderFullPage}>
        <div className={s.loader}></div>
      </div>
    );
  return (
    <div className={s.container}>
      <div className={s.headerContainer}>
        <h1 className={s.pageTitle}>Xác minh Seller</h1>
        <p className={s.pageSubtitle}>Xem thông tin và duyệt Seller đăng ký!</p>
      </div>
      <div className={s.card}>
        <div className={s.cardInner}>
          <h2 className={s.sectionTitle}>
            Yêu cầu chờ duyệt ({requests.length})
          </h2>
          {requests.length === 0 ? (
            <div className={s.emptyState}>
              <HiOutlineCheckCircle size={48} className={s.emptyStateIcon} />
            </div>
          ) : (
            <div className={s.requestGrid}>
              {requests.map((request) => (
                <div key={request._id} className={s.requestCard}>
                  <div className={s.requestHeader}>
                    <div className={s.avatar}>
                      {request.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className={s.requestName}>{request.name}</div>
                      <div className={s.requestDate}>
                        <HiOutlineClock /> Đã tham gia{" "}
                        {new Date(request.createdAt).toLocaleDateString("vi-VN")}
                      </div>
                    </div>
                  </div>
                  <div className={s.contactInfo}>
                    <div className={s.contactItem}>
                      <HiOutlineMail size={18} className="text-primary" />{" "}
                      {request.email}
                    </div>
                    {request.phone && (
                      <div className={s.contactItem}>
                        <HiOutlinePhone size={18} className="text-primary" />
                        {request.phone}
                      </div>
                    )}
                  </div>
                  <button
                    className={s.approveButton}
                    onClick={() => handleApprove(request._id)}
                  >
                    Duyệt
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SellerRequests;
