import { useEffect, useState } from "react";
import { sellerDashboardStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import axios from "axios";
import API_URL from "../../config";
import {
  HiOutlineBell,
  HiOutlineCheckCircle,
  HiOutlineDownload,
  HiOutlineEye,
  HiOutlineLibrary,
  HiOutlinePencilAlt,
  HiOutlineSearch,
  HiOutlineTrash,
  HiOutlineUserGroup,
  HiPlus,
} from "react-icons/hi";
import { Link } from "react-router-dom";
import PropertyCard from "../../components/common/PropertyCard";
import useNotificationEvent from "../../hooks/useNotificationEvent";
import {
  INQUIRY_STATUS_LABELS,
  getInquiryStatus,
  getPropertyTypeLabel,
  getStatusLabel,
  joinAddress,
} from "../../utils/propertyLabels";

const SellerDashboard = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState({
    totalProperties: 0,
    activeListings: 0,
    soldProperties: 0,
    totalInquiries: 0,
    totalViews: 0,
  });

  const [properties, setProperties] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // tăng lên khi tin được duyệt / bị từ chối → tải lại số liệu và danh sách
  const [reloadKey, setReloadKey] = useState(0);
  useNotificationEvent(["property_approved", "property_rejected", "inquiry_new"], () =>
    setReloadKey((k) => k + 1),
  );

  //to fetch all data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, propsRes, inqRes] = await Promise.all([
          axios.get(`${API_URL}api/property/seller/dashboard`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}api/property/my`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}api/inquiry/seller?limit=3`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setStats(statsRes.data.stats || statsRes.data);
        const props = Array.isArray(propsRes.data)
          ? propsRes.data
          : propsRes.data.properties || [];
        setProperties(props);
        setInquiries(
          Array.isArray(inqRes.data.inquiries)
            ? inqRes.data.inquiries.slice(0, 3)
            : Array.isArray(inqRes.data)
              ? inqRes.data.slice(0, 3)
              : [],
        );
        setLoading(false);
      } catch (error) {
        console.error("Tải dữ liệu thất bại!", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, reloadKey]);

  //to delete a property
  const handleDelete = async (id) => {
    if (!window.confirm("Bạn chắc chắn muốn xóa danh sách này chứ?")) return;
    try {
      await axios.delete(`${API_URL}api/property/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProperties(properties.filter((p) => p._id !== id));
    } catch {
      alert("Xóa thất bại!");
    }
  };

  //to update status ( make it sold or for sale)
  // const handleStatusUpdate = async (id, currentStatus) => {
  //   const newStatus = currentStatus === "sold" ? "sale" : "sold";

  //   try {
  //     await axios.patch(
  //       `${API_URL}api/property/${id}/status`,
  //       {
  //         status: newStatus,
  //       },

  //       {
  //         headers: { Authorization: `Bearer ${token}` },
  //       },
  //     );
  //     setProperties(
  //       properties.map((p) => (p._id === id ? { ...p, status: newStatus } : p)),
  //     );
  //   } catch (error) {
  //     alert("Cập nhật sản phẩm thất bại!");
  //   }
  // };
  const handleStatusUpdate = async (id, currentStatus) => {
    const newStatus = currentStatus === "sold" ? "sale" : "sold";

    try {
      await axios.patch(
        `${API_URL}api/property/${id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // Cập nhật lại danh sách
      setProperties((prevProperties) =>
        prevProperties.map((p) =>
          p._id === id ? { ...p, status: newStatus } : p,
        ),
      );

      // Optional: thông báo thành công
      // alert(newStatus === "sold" ? "Đã chuyển sang trạng thái ĐÃ BÁN" : "Đã chuyển sang trạng thái CÒN BÁN");
    } catch (error) {
      console.error("Update status error:", error);
      alert("Cập nhật trạng thái thất bại! Vui lòng thử lại.");
    }
  };
  //to export the data
  const handleExport = () => {
    const headers = ["Tiêu đề", "Vị trí", "Loại hình", "Giá", "Trạng thái", "Lượt xem"];
    const csvRows = properties.map((p) => [
      p.title,
      joinAddress(p.area, p.city),
      getPropertyTypeLabel(p.propertyType),
      p.price,
      getStatusLabel(p.status),
      p.views || 0,
    ]);

    // Bọc mọi ô trong dấu nháy kép (nhân đôi nháy bên trong) để dấu phẩy/xuống dòng không làm lệch cột
    const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csvContent = [headers, ...csvRows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\r\n");
    // BOM để Excel nhận đúng UTF-8 (tiếng Việt có dấu)
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "property_listings.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading)
    return (
      <div className="loader-full-page">
        <div className="loader"></div>
      </div>
    );

  const statCards = [
    {
      title: "Tổng lượt xem",
      value: stats.totalViews?.toLocaleString() || "0",
      icon: HiOutlineEye,
      color: "#0d6e59",
    },
    {
      title: "Khách hàng đang chăm sóc",
      value: (stats.openInquiries ?? 0).toLocaleString(),
      icon: HiOutlineUserGroup,
      color: "#0d6e59",
      hint: stats.totalInquiries
        ? `Tổng ${stats.totalInquiries.toLocaleString()} yêu cầu đã nhận`
        : null,
      to: "/inquiries",
    },
    {
      title: "BĐS đang hiển thị",
      value: stats.activeListings?.toLocaleString() || "0",
      icon: HiOutlineLibrary,
      color: "#0d6e59",
      hint:
        [
          stats.pendingListings ? `${stats.pendingListings} chờ duyệt` : "",
          stats.rejectedListings ? `${stats.rejectedListings} bị từ chối` : "",
        ]
          .filter(Boolean)
          .join(" · ") || null,
      to: "/my-properties",
    },
    {
      title: "BĐS đã bán",
      value: stats.soldProperties?.toLocaleString() || "0",
      icon: HiOutlineCheckCircle,
      color: "#0d6e59",
    },
  ];

  const filteredProperties = Array.isArray(properties)
    ? properties
        .filter(
          (p) =>
            p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.area.toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];

  return (
    <>
      <header className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.headerTitle}>Bảng điều khiển người bán</h1>
          <p className={s.headerSubtitle}>
            Quản lý danh mục đầu tư bất động sản và theo dõi hiệu quả kinh
            doanh.
          </p>
        </div>
        <div className={s.headerActions}>
          <button onClick={handleExport} className={s.exportButton}>
            <HiOutlineDownload size={20} />
            Xuất file
          </button>
          <Link to="/add-property" className={s.addButton}>
            <HiPlus size={20} /> Thêm BĐS
          </Link>
        </div>
      </header>

      {/* stats grid */}
      <div className={s.statsGrid}>
        {statCards.map((card, i) => {
          const Card = card.to ? Link : "div";
          return (
            <Card
              style={{ "--card-color": card.color }}
              key={i}
              to={card.to}
              className={`${s.statCard} ${card.to ? s.statCardLink : ""}`}
            >
              <div className={s.statIconWrapper}>
                <card.icon size={20} />
              </div>
              <div className={s.statTitle}>{card.title}</div>
              <div className={s.statValue}>{card.value}</div>
              {card.hint && <div className={s.statHint}>{card.hint}</div>}
            </Card>
          );
        })}
      </div>
      <div className={s.listingsSection}>
        <div className={s.listingsHeader}>
          <h2 className={s.listingsTitle}>Danh sách BĐS</h2>
          <div className={s.searchWrapper}>
            <HiOutlineSearch className={s.searchIcon} />
            <input
              type="text"
              placeholder="Tìm kiếm BĐS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={s.searchInput}
            />
          </div>
        </div>
        {filteredProperties.length === 0 ? (
          <div className={s.emptyListings}>
            Không có BĐS nào khớp với "{searchTerm}".
          </div>
        ) : (
          <>
            <div className={s.propertiesGrid}>
              {filteredProperties.slice(0, 3).map((p) => (
                <PropertyCard
                  key={p._id}
                  property={p}
                  showModeration
                  renderActions={() => (
                    <div className={s.propertyActions}>
                      {/* <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusUpdate(p._id, p.status);
                        }}
                        className={s.statusButton(p.status)}
                        title={
                          p.status === "sold"
                            ? "Đánh dấu là còn bán"
                            : "Đánh dấu đã bán"
                        }
                      >
                        <HiOutlineCheckCircle size={14} />{" "}
                        {p.status === "sold" ? "Có sẵn" : "Đã bán"}
                      </button> */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusUpdate(p._id, p.status);
                        }}
                        className={s.statusButton(p.status)}
                        title={
                          p.status === "sold"
                            ? "Chuyển về trạng thái đang bán"
                            : "Đánh dấu là đã bán"
                        }
                      >
                        <HiOutlineCheckCircle size={14} />
                        {p.status === "sold" ? "Còn bán" : "Đã bán"}
                      </button>
                      <Link
                        to={`/edit-property/${p._id}`}
                        className={s.editButton}
                      >
                        <HiOutlinePencilAlt size={14} /> Chinh sửa
                      </Link>

                      <button
                        onClick={() => handleDelete(p._id)}
                        className={s.deleteButton}
                      >
                        <HiOutlineTrash size={14} /> Xóa
                      </button>
                    </div>
                  )}
                />
              ))}
            </div>

            {filteredProperties.length > 3 && (
              <div className={s.showMoreWrapper}>
                <Link to="/my-properties" className={s.showMoreButton}>
                  Hiển thị thêm{" "}
                  <HiOutlinePencilAlt
                    size={18}
                    style={{
                      transform: "rotate(90deg)",
                    }}
                  />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
      <div className={s.widgetsGrid}>
        <div className={s.inquiriesWidget}>
          <h2 className={s.widgetTitle}>Yêu cầu tư vấn gần đây</h2>
          <p className={s.widgetSubtitle}>Khách hàng tiềm năng mới liên hệ</p>
          <div className={s.inquiriesList}>
            {inquiries.map((inq) => (
              <Link
                key={inq._id}
                to={`/inquiries?id=${inq._id}`}
                className={`${s.inquiryItem} rounded-xl -mx-2 px-2 py-1 hover:bg-[#f8fafc]`}
              >
                <div className={s.inquiryLeft}>
                  <div className={s.inquiryIcon}>
                    <HiOutlineBell size={18} color="var(--primary)" />
                  </div>
                  <div>
                    <div className={s.inquiryName}>
                      {inq.buyer?.name || "Khách hàng tiềm năng"}
                    </div>
                    <div className={s.inquiryProperty}>
                      {!inq.property
                        ? "Tin đăng đã bị xóa"
                        : inq.property.title?.length > 30
                          ? inq.property.title.slice(0, 30) + "..."
                          : inq.property.title}
                    </div>
                  </div>
                </div>
                <div className={s.inquiryRight}>
                  <div className={s.inquiryDate}>
                    {new Date(inq.createdAt).toLocaleDateString("vi-VN")}
                  </div>
                  <span className={s.inquiryStatus(getInquiryStatus(inq))}>
                    {INQUIRY_STATUS_LABELS[getInquiryStatus(inq)]}
                  </span>
                </div>
              </Link>
            ))}
            {inquiries.length === 0 && (
              <p className={s.noInquiries}>Không có yêu cầu gần đây</p>
            )}
            {inquiries.length > 0 && (
              <Link to="/inquiries" className="text-sm font-semibold text-primary hover:underline">
                Quản lý tất cả khách hàng →
              </Link>
            )}
          </div>
        </div>
        <div className={s.tipsWidget}>
          <h2 className={s.widgetTitle}>Gợi ý nhanh</h2>
          <div className={s.tipsList}>
            <div className={s.tipCardHighViews}>
              <h4 className={s.tipTitleHighViews}>
                <HiOutlineEye size={16} /> Được xem nhiều!
              </h4>
              <p className={s.tipTextHighViews}>
                BĐS của bạn đang được quan tâm . Hãy cập nhật thêm video/hình
                ảnh!!
              </p>
            </div>
            <div className={s.tipCardMarket}>
              <h4 className={s.tipTitleMarket}>Phân tích thị trường</h4>
              <p className={s.tipTextMarket}>
                Thị trường khu vực đang tăng trưởng nhanh. Mức giá của bạn hiện
                rất cạnh tranh.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SellerDashboard;
