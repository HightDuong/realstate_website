import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { myPropertiesStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import { Link } from "react-router-dom";
import axios from "axios";
import API_URL from "../../config";
import {
  HiArrowRight,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineFire,
  HiOutlineLibrary,
  HiOutlineRefresh,
  HiOutlinePencilAlt,
  HiOutlineSearch,
  HiOutlineTrash,
  HiX,
} from "react-icons/hi";
import PropertyCard from "../../components/common/PropertyCard";
import Select from "../../components/common/Select";
import Pagination from "../../components/common/Pagination";
import useNotificationEvent from "../../hooks/useNotificationEvent";

// Bỏ dấu tiếng Việt để "cau giay" vẫn khớp "Cầu Giấy"
const normalize = (str = "") =>
  str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
const PAGE_SIZE = 9;

const formatPrice = (price) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    price || 0,
  );

const MyProperties = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const gridTopRef = useRef(null);
  const { token } = useAuth();
  const [trending, setTrending] = useState(null);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState("");

  const fetchTrending = useCallback(async () => {
    setTrendingLoading(true);
    setTrendingError("");
    try {
      const res = await axios.get(
        `${API_URL}api/property/seller/trending-today`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setTrending(res.data);
    } catch (err) {
      setTrendingError(
        err.response?.data?.message || "Không tải được thống kê hôm nay",
      );
    } finally {
      setTrendingLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  const cities = useMemo(
    () =>
      [...new Set(properties.map((p) => p.city?.trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "vi"),
      ),
    [properties],
  );

  const filteredProperties = useMemo(() => {
    const q = normalize(keyword);
    return properties.filter((p) => {
      if (cityFilter !== "all" && p.city?.trim() !== cityFilter) return false;
      if (statusFilter !== "all" && (p.status || "sale") !== statusFilter)
        return false;
      if (!q) return true;
      return [p.area, p.city, p.address, p.title].some((field) =>
        normalize(field).includes(q),
      );
    });
  }, [properties, keyword, cityFilter, statusFilter]);

  const isFiltering =
    keyword.trim() !== "" || cityFilter !== "all" || statusFilter !== "all";

  // Phân trang phía client (API /my trả về toàn bộ tin của seller)
  const totalPages = Math.max(
    Math.ceil(filteredProperties.length / PAGE_SIZE),
    1,
  );
  // Xóa tin/đổi trạng thái có thể làm giảm số trang → không vượt quá trang cuối
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedProperties = filteredProperties.slice(
    pageStart,
    pageStart + PAGE_SIZE,
  );

  // Dữ liệu cho ô "Xem thêm": số tin còn lại và ảnh xem trước của trang kế
  const remainingCount =
    filteredProperties.length - (pageStart + pagedProperties.length);
  const nextPagePreview = filteredProperties.slice(
    pageStart + PAGE_SIZE,
    pageStart + PAGE_SIZE + 3,
  );

  const goToPage = (target) => {
    if (target < 1 || target > totalPages || target === currentPage) return;
    setPage(target);
    // cuộn lên đầu lưới (trừ phần header cố định)
    const top = gridTopRef.current
      ? gridTopRef.current.getBoundingClientRect().top + window.scrollY - 120
      : 0;
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  };

  // Đổi điều kiện lọc thì quay về trang 1
  const changeFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const resetFilters = () => {
    setKeyword("");
    setCityFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  //Lấy dữ liệu các bất động sản từ phía máy chủ dành riêng cho người bán này
  const fetchMyProperties = async () => {
    try {
      const res = await axios.get(`${API_URL}api/property/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const props = Array.isArray(res.data)
        ? res.data
        : res.data.properties || [];
      setProperties(props);
      setLoading(false);
    } catch (error) {
      setError("Tải danh sách thất bại!", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyProperties();
  }, []);

  // Tin vừa được duyệt / bị từ chối → tải lại để nhãn trạng thái và lý do cập nhật ngay
  useNotificationEvent(["property_approved", "property_rejected"], () => {
    fetchMyProperties();
  });

  //to delete a property
  const handleDelete = async (id) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa BĐS này không?")) return;
    try {
      await axios.delete(`${API_URL}api/property/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProperties((prev) => prev.filter((p) => p._id !== id));
      // tin đã xóa không còn nằm trong "BĐS được quan tâm hôm nay"
      fetchTrending();
    } catch (error) {
      alert(error.response?.data?.message || "Xóa BĐS thất bại!");
    }
  };

  //to update the status

  //   const updateStatus = async (id, newStatus) => {
  //     try {
  //       await axios.patch(
  //         `${API_URL}api/property/${id}/status`,
  //         {
  //           status: newStatus,
  //         },
  //         {
  //           headers: { Authorization: `Bearer ${token}` },
  //         },
  //       );
  //       setProperties(
  //         properties.map((p) => (p._id === id ? { ...p, status: newStatus } : p)),
  //       );
  //     } catch (error) {
  //       alert("Cập nhật trạng thái thất bại!");
  //     }
  //   };

  const updateStatus = async (id, newStatus) => {
    try {
      await axios.patch(
        `${API_URL}api/property/${id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setProperties((prev) =>
        prev.map((p) => (p._id === id ? { ...p, status: newStatus } : p)),
      );

      alert(
        newStatus === "sold"
          ? " Đã chuyển sang ĐÃ BÁN"
          : " Đã chuyển sang CÒN BÁN",
      );
    } catch (error) {
      console.error(error);
      alert("Cập nhật trạng thái thất bại!");
    }
  };
  if (loading)
    return (
      <div className={s.loaderFullPage}>
        <div className={s.loader}></div>
      </div>
    );

  const getAvailableStatus = (p) => {
    return "sale";
  };
  return (
    <div className={s.fadeIn}>
      <div className={s.fadeIn}>
        <div className={s.header}>
          <div>
            <h1 className={s.heading}>Danh sách của tôi.</h1>
            <p className={s.subheading}>
              Quản lý danh sách BĐS và trạng thái của chúng!
            </p>
          </div>

          <Link to="/add-property" className={s.addButton}>
            Đăng BĐS mới
          </Link>
        </div>
        <div className={s.content}>
          {!Array.isArray(properties) || properties.length === 0 ? (
            <div className={s.emptyCard}>
              <div className={s.emptyIconWrapper}>
                <HiOutlineLibrary size={40} color="#94a3b8" />
              </div>
              <h2 className={s.emptyTitle}>Không tìm thấy BĐS</h2>
              <p className={s.emptyText}>
                Khởi đầu trải nghiệm bằng việc thêm bài đăng bất động sản đầu
                tiên của bạn
              </p>
              <Link to="/add-property" className={s.emptyButton}>
                Thêm BĐS đầu tiên của bạn
              </Link>
            </div>
          ) : (
            <>
            <section className={s.trendingCard}>
              <div className={s.trendingHeader}>
                <div>
                  <h2 className={s.trendingTitle}>
                    <span className={s.trendingFire}>
                      <HiOutlineFire size={20} />
                    </span>
                    Được quan tâm hôm nay
                  </h2>
                  <p className={s.trendingSubtitle}>
                    Xếp hạng theo lượt xem của khách trong ngày{" "}
                    {new Date().toLocaleDateString("vi-VN")} (không tính lượt
                    xem của chính bạn)
                  </p>
                </div>
                <div className={s.trendingSummary}>
                  <div className={s.trendingStat}>
                    <HiOutlineEye size={18} />
                    <span className={s.trendingStatValue}>
                      {trending?.totalViewsToday ?? 0}
                    </span>
                    lượt xem
                  </div>
                  <div className={s.trendingStat}>
                    <HiOutlineLibrary size={18} />
                    <span className={s.trendingStatValue}>
                      {trending?.viewedPropertiesToday ?? 0}
                    </span>
                    tin được xem
                  </div>
                  <button
                    type="button"
                    onClick={fetchTrending}
                    disabled={trendingLoading}
                    className={s.refreshButton}
                    title="Làm mới"
                  >
                    <HiOutlineRefresh
                      size={18}
                      className={trendingLoading ? "animate-spin" : ""}
                    />
                  </button>
                </div>
              </div>

              {trendingLoading && !trending ? (
                <div className={s.trendingList}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={s.trendingSkeleton} />
                  ))}
                </div>
              ) : trendingError ? (
                <div className={s.trendingEmpty}>
                  <p>{trendingError}</p>
                  <button
                    type="button"
                    onClick={fetchTrending}
                    className={s.resetButton}
                  >
                    Thử lại
                  </button>
                </div>
              ) : !trending?.properties?.length ? (
                <div className={s.trendingEmpty}>
                  <HiOutlineEye size={32} color="#cbd5e1" />
                  <p className="mt-2">
                    Hôm nay chưa có khách nào xem tin của bạn.
                  </p>
                </div>
              ) : (
                <ol className={s.trendingList}>
                  {trending.properties.map(({ property, todayViews }, i) => (
                    <li key={property._id} className={s.trendingItem}>
                      <span className={s.rankBadge(i + 1)}>{i + 1}</span>
                      <img
                        src={property.image || "/placeholder.jpg"}
                        alt={property.title}
                        className={s.trendingThumb}
                      />
                      <div className={s.trendingInfo}>
                        <Link
                          to={`/property/${property._id}`}
                          className={s.trendingName}
                        >
                          {property.title}
                          {property.status === "sold" && (
                            <span className={s.soldTag}>Đã bán</span>
                          )}
                        </Link>
                        <p className={s.trendingMeta}>
                          {[property.area, property.city]
                            .filter(Boolean)
                            .join(", ")}{" "}
                          · {formatPrice(property.price)}
                        </p>
                        <div className={s.trendingBarTrack}>
                          <div
                            className={s.trendingBar}
                            style={{
                              width: `${
                                (todayViews /
                                  trending.properties[0].todayViews) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className={s.trendingViews}>
                        <div className={s.trendingViewsToday}>
                          <HiOutlineEye size={18} />
                          {todayViews}
                        </div>
                        <div className={s.trendingViewsTotal}>
                          hôm nay · {property.views || 0} tổng
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <div className={s.toolbar}>
              <div className={s.searchWrapper}>
                <HiOutlineSearch size={18} className={s.searchIcon} />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => changeFilter(setKeyword, e.target.value)}
                  placeholder="Tìm theo khu vực, quận/huyện, thành phố..."
                  className={s.searchInput}
                />
                {keyword && (
                  <button
                    type="button"
                    onClick={() => changeFilter(setKeyword, "")}
                    className={s.clearSearch}
                    title="Xóa từ khóa"
                  >
                    <HiX size={16} />
                  </button>
                )}
              </div>
              <Select
                value={cityFilter}
                onChange={(e) => changeFilter(setCityFilter, e.target.value)}
                className={s.filterSelect}
                ariaLabel="Lọc theo thành phố"
                options={[
                  { value: "all", label: "Tất cả thành phố" },
                  ...cities.map((city) => ({ value: city, label: city })),
                ]}
              />
              <Select
                value={statusFilter}
                onChange={(e) => changeFilter(setStatusFilter, e.target.value)}
                className={s.filterSelect}
                ariaLabel="Lọc theo trạng thái"
                options={[
                  { value: "all", label: "Tất cả trạng thái" },
                  { value: "sale", label: "Còn bán" },
                  { value: "sold", label: "Đã bán" },
                ]}
              />
            </div>

            <p className={s.resultInfo}>
              Hiển thị {filteredProperties.length} / {properties.length} tin đăng
              {isFiltering && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className={s.resetButton}
                >
                  · Xóa bộ lọc
                </button>
              )}
            </p>

            {filteredProperties.length === 0 ? (
              <div className={s.emptyCard}>
                <div className={s.emptyIconWrapper}>
                  <HiOutlineSearch size={40} color="#94a3b8" />
                </div>
                <h2 className={s.emptyTitle}>Không có tin đăng phù hợp</h2>
                <p className={s.emptyText}>
                  Thử từ khóa khác hoặc bỏ bớt điều kiện lọc.
                </p>
                <button onClick={resetFilters} className={s.emptyButton}>
                  Xóa bộ lọc
                </button>
              </div>
            ) : (
            <div ref={gridTopRef} className={s.grid}>
              {pagedProperties.map((p) => (
                <PropertyCard
                  key={p._id}
                  property={p}
                  showModeration
                  renderActions={() => (
                    <div className="w-full flex flex-col gap-3">
                    {p.moderationStatus === "rejected" && p.rejectionReason && (
                      <div className="rounded-xl bg-[#fef2f2] border border-[#fecaca] px-3 py-2 text-xs text-[#b91c1c]">
                        <span className="font-bold">Lý do từ chối:</span> {p.rejectionReason}
                        <span className="block mt-1 text-[#7f1d1d]">
                          Chỉnh sửa tin để tự động gửi duyệt lại.
                        </span>
                      </div>
                    )}
                    {p.moderationStatus === "pending" && (
                      <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] px-3 py-2 text-xs text-[#b45309]">
                        Tin đang chờ quản trị viên duyệt, chưa hiển thị công khai.
                      </div>
                    )}
                    <div className={s.actionContainer}>
                      <div className={s.selectWrapper}>
                        <Select
                          value={p.status || "sale"}
                          onChange={(e) => updateStatus(p._id, e.target.value)}
                          ariaLabel="Trạng thái tin đăng"
                          className={`${s.select} ${
                            p.status === "sold"
                              ? s.selectSold
                              : s.selectAvailable
                          }`}
                          options={[
                            { value: "sale", label: "Còn bán" },
                            { value: "sold", label: "Đã bán" },
                          ]}
                        />
                      </div>

                      <Link
                        to={`/edit-property/${p._id}`}
                        className={s.editButton}
                      >
                        <HiOutlinePencilAlt /> Chỉnh sửa
                      </Link>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p._id);
                        }}
                        className={s.deleteButton}
                      >
                        <HiOutlineTrash />
                      </button>
                    </div>
                    </div>
                  )}
                />
              ))}

              {currentPage < totalPages && (
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  className={s.seeMoreCard}
                  aria-label={`Xem thêm, sang trang ${currentPage + 1}`}
                >
                  <span className={s.seeMoreGlow} />
                  {nextPagePreview.length > 0 && (
                    <div className={s.seeMoreThumbs}>
                      {nextPagePreview.map((p) => (
                        <img
                          key={p._id}
                          src={p.images?.[0] || "/placeholder.jpg"}
                          alt=""
                          className={s.seeMoreThumb}
                        />
                      ))}
                    </div>
                  )}
                  <span className={s.seeMoreIcon}>
                    <HiArrowRight size={24} />
                  </span>
                  <span className={s.seeMoreTitle}>Xem thêm</span>
                  <span className={s.seeMoreText}>
                    Còn {remainingCount} tin đăng khác
                  </span>
                  <span className={s.seeMorePageTag}>
                    Trang {currentPage + 1} / {totalPages}
                  </span>
                </button>
              )}
            </div>
            )}

            {filteredProperties.length > 0 && (
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
                from={pageStart + 1}
                to={pageStart + pagedProperties.length}
                total={filteredProperties.length}
                unit="tin đăng"
              />
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyProperties;
