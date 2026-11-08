import { useCallback, useEffect, useState } from "react";
import { adminDashboardStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import API_URL from "../../config";
import {
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineLibrary,
  HiOutlineTicket,
  HiOutlineUserGroup,
} from "react-icons/hi";

// Trạng thái thật từ GET /api/admin/stats (system). null = không gọi được API.
const SERVICES = [
  { key: "database", name: "Cơ sở dữ liệu", ok: "Đang hoạt động", off: "Mất kết nối" },
  { key: "media", name: "Lưu trữ ảnh (Cloudinary)", ok: "Đã cấu hình", off: "Chưa cấu hình" },
  { key: "email", name: "Gửi email (Brevo)", ok: "Đã cấu hình", off: "Chưa cấu hình" },
  { key: "ai", name: "Trợ lý AI (OpenAI)", ok: "Đang bật", off: "Đang tắt" },
];

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalProperties: 0,
    activeListings: 0,
    soldProperties: 0,
  });
  const [system, setSystem] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

  //to fetch dashboard data
  const fetchDashboardData = useCallback(
    () =>
      axios
        .get(`${API_URL}api/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          if (res.data.success) {
            setStats(res.data.stats);
            setSystem(res.data.system || null);
          }
        })
        .catch((error) => {
          console.error("Tải thất bại!", error);
          setSystem(null);
        })
        .finally(() => {
          setCheckedAt(new Date());
          setLoading(false);
          setRefreshing(false);
        }),
    [token],
  );

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
  };

  if (loading) {
    return (
      <div className={s.loaderFullPage}>
        <div className={s.loader}></div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Số lượng người dùng",
      value: stats.totalUsers || 0,
      icon: HiOutlineUserGroup,
      color: "#0d9488",
      bg: "#ccfbf1",
    },
    {
      title: "Tổng BĐS",
      value: stats.totalProperties || 0,
      icon: HiOutlineLibrary,
      color: "#f59e0b",
      bg: "#fef3c7",
    },
    {
      title: "Tin đang hiển thị",
      value: stats.activeListings || 0,
      icon: HiOutlineTicket,
      color: "#3b82f6",
      bg: "#dbeafe",
    },
    {
      title: "Số lượng đã bán",
      value: stats.soldProperties || 0,
      icon: HiOutlineCheckCircle,
      color: "#10b981",
      bg: "#dcfce7",
    },
    {
      title: "Tin chờ duyệt",
      value: stats.pendingProperties || 0,
      icon: HiOutlineClock,
      color: "#d97706",
      bg: "#fef3c7",
      link: "/admin/properties",
    },
  ];

  return (
    <>
      <div className={s.headerContainer}>
        <div>
          <h1 className={s.pageTitle}>Tổng quan quản trị</h1>
          <p className={s.pageSubtitle}>
            Chào mừng quay trở lại, Quản trị viên! Đây là tổng quan hôm nay.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={s.refreshButton}
        >
          {refreshing ? "Đang cập nhật..." : "Cập nhật lại"}
        </button>
      </div>

      <div className={s.statsGrid}>
        {statCards.map((card, i) => (
          <div
            key={i}
            className={`${s.statCard} ${card.link ? "cursor-pointer hover:ring-2 hover:ring-[#fde68a]" : ""}`}
            onClick={card.link ? () => navigate(card.link) : undefined}
          >
            <div
              className={s.statIconContainer}
              style={{
                backgroundColor: card.bg,
                color: card.color,
              }}
            >
              <card.icon size={22} />
            </div>
            <div>
              <div className={s.statTitle}>{card.title}</div>
              <div className={s.statValue}>{card.value.toLocaleString("vi-VN")}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={s.secondGrid}>
        <div className={s.systemHealthCard}>
          <h3 className={s.systemHealthTitle}>Trạng thái hệ thống</h3>
          <div className={s.servicesContainer}>
            {SERVICES.map((service) => {
              const ok = system ? Boolean(system[service.key]) : false;
              return (
                <div key={service.key} className={s.serviceItem}>
                  <div className={s.serviceName}>{service.name}</div>
                  <div className={s.statusContainer}>
                    <span className={s.statusDot(ok)}></span>
                    <span className={s.statusText(ok)}>
                      {system ? (ok ? service.ok : service.off) : "Không kết nối được"}
                    </span>
                  </div>
                </div>
              );
            })}
            {checkedAt && (
              <span className={s.serviceHint}>
                Kiểm tra lúc {checkedAt.toLocaleTimeString("vi-VN")}
              </span>
            )}
          </div>
        </div>
        <div className={s.adminToolsCard}>
          <h3 className={s.adminToolsTitle}>Việc cần xử lý</h3>
          <p className={s.adminToolsDesc}>
            Đi nhanh tới các mục đang chờ quản trị viên.
          </p>
          <div className={s.adminToolsButtonsContainer}>
            {[
              { to: "/admin/properties", label: "Duyệt tin đăng", count: stats.pendingProperties },
              { to: "/admin/seller-requests", label: "Yêu cầu làm người bán", count: stats.pendingSellers },
              { to: "/admin/inquiries", label: "Yêu cầu tư vấn đang mở", count: stats.openInquiries },
              { to: "/admin/contacts", label: "Thư liên hệ chờ xử lý", count: stats.pendingContacts ?? stats.totalContacts },
            ].map((item) => (
              <Link key={item.to} to={item.to} className={s.adminToolButton}>
                {item.label}
                <span className={s.adminToolCount}>
                  {(item.count || 0).toLocaleString("vi-VN")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;
