import React, { useEffect, useState, useRef } from "react";
import { propertiesStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../components/common/Navbar";
import {
  HiAdjustments,
  HiFilter,
  HiSearch,
  HiViewGrid,
  HiViewList,
  HiX,
} from "react-icons/hi";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import API_URL from "../../config";
import PropertyCard from "../../components/common/PropertyCard";
import Select from "../../components/common/Select";
import Pagination from "../../components/common/Pagination";
import RecommendedProperties from "../../components/ai/RecommendedProperties";

const PAGE_SIZE = 12; // 3 hàng × 4 thẻ

const Properties = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const location = useLocation();
  const [properties, setProperties] = useState([]);
  const [wishlistedIds, setWishlistedIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  // phân trang
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const requestIdRef = useRef(0); // bỏ qua response cũ khi người dùng đổi bộ lọc liên tục
  const resultsTopRef = useRef(null);

  const [filters, setFilters] = useState({
    city: "",
    propertyType: [],
    bhk: "",
    maxPrice: 50000000000,
    amenities: [],
    furnishing: [],
    sort: "latest",
  });

  const propertyTypes = [
    { label: "Căn hộ / Chung cư", value: "flat" },
    { label: "Nhà riêng / Biệt thự", value: "villa" },
    { label: "Penthouse", value: "penthouse" },
    { label: "Mặt bằng thương mại", value: "commercial" },
  ];
  const bhkOptions = ["1", "2", "3", "4", "5+"];
  const furnishingOptions = [
    { label: "Đầy đủ nội thất", value: "furnished" },
    { label: "Nội thất cơ bản", value: "semi-furnished" },
    { label: "Nhà trống / Không nội thất", value: "unfurnished" },
  ];

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const city = queryParams.get("city") || "";
    const type = queryParams.get("type") || "";
    const bhk = queryParams.get("bhk") || "";

    const initialFilters = {
      ...filters,
      city,
      propertyType: type ? [type] : [],
      bhk,
    };
    setFilters(initialFilters);
    fetchProperties(initialFilters);
    if (user) {
      fetchWishlist();
    }
  }, [location.search, user]);

  // const fetchWishlist = async () => {
  //   try {
  //     const res = await axios.get(`${API_URL}api/wishlist`, {
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //     setWishlistedIds(
  //       res.data
  //         .filter((item) => item.property)
  //         .map((item) => String(item.property._id)),
  //     );
  //   } catch (error) {
  //     console.error("Failed to fetch wishlist:", error);
  //   }
  // };

  const fetchWishlist = async () => {
    if (!user || !token) return;

    try {
      const res = await axios.get(`${API_URL}api/wishlist`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Xử lý response đúng cấu trúc { success: true, data: [] }
      const wishlistData =
        res.data?.data || res.data?.wishlist || res.data || [];

      setWishlistedIds(
        wishlistData
          .filter((item) => item?.property?._id)
          .map((item) => item.property._id),
      );
    } catch (error) {
      console.error("Lỗi khi tải danh sách yêu thích", error);
      setWishlistedIds([]); // Tránh crash UI
    }
  };

  //to toggle wishlist
  // const handleToggleWishlist = async (propertyId) => {
  //   try {
  //     const isWishlisted = wishlistedIds.includes(propertyId);

  //     if (isWishlisted) {
  //       await axios.delete(`${API_URL}api/wishlist/${propertyId}`, {
  //         headers: { Authorization: `Bearer ${token}` },
  //       });

  //       setWishlistedIds((prev) => prev.filter((id) => id !== propertyId));
  //     } else {
  //       await axios.post(
  //         `${API_URL}api/wishlist/${propertyId}`,
  //         {},
  //         {
  //           headers: { Authorization: `Bearer ${token}` },
  //         },
  //       );
  //       setWishlistedIds((prev) => [...prev, propertyId]);
  //     }
  //   } catch (error) {
  //     console.error("Failed to update wishlist:", error);
  //   }
  // };

  const handleToggleWishlist = async (propertyId) => {
    if (!user || !token) {
      navigate("/login"); // hoặc alert("Vui lòng đăng nhập")
      return;
    }

    try {
      const isWishlisted = wishlistedIds.includes(propertyId);

      if (isWishlisted) {
        await axios.delete(`${API_URL}api/wishlist/${propertyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(
          `${API_URL}api/wishlist/${propertyId}`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }

      // Cập nhật state
      setWishlistedIds((prev) =>
        isWishlisted
          ? prev.filter((id) => id !== propertyId)
          : [...prev, propertyId],
      );
    } catch (error) {
      console.error("Lỗi toggle wishlist:", error);
      alert("Có lỗi khi cập nhật yêu thích. Vui lòng thử lại!");
    }
  };

  //to fetch properties
  // đổi bộ lọc/sắp xếp luôn gọi với pageToLoad = 1 (quay về trang đầu)
  const fetchProperties = async (currentFilters, pageToLoad = 1) => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setPage(pageToLoad);
      const params = new URLSearchParams();
      if (currentFilters.city) params.append("city", currentFilters.city);
      if (currentFilters.propertyType.length > 0)
        params.append("propertyType", currentFilters.propertyType.join(","));
      if (currentFilters.bhk) params.append("bhk", currentFilters.bhk);
      if (currentFilters.maxPrice)
        params.append("maxPrice", currentFilters.maxPrice);
      if (currentFilters.furnishing && currentFilters.furnishing.length > 0)
        params.append("furnishing", currentFilters.furnishing.join(","));
      if (currentFilters.sort) params.append("sort", currentFilters.sort);
      params.append("page", pageToLoad);
      params.append("limit", PAGE_SIZE);

      const res = await axios.get(
        `${API_URL}api/property?${params.toString()}`,
      );
      if (requestId !== requestIdRef.current) return;

      const items = res.data.properties || [];
      const newTotal = res.data.total ?? items.length;
      const newTotalPages = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));

      // trang yêu cầu không còn tồn tại (vd. tin vừa bị xóa) → chuyển về trang cuối
      if (items.length === 0 && pageToLoad > newTotalPages && newTotal > 0) {
        return fetchProperties(currentFilters, newTotalPages);
      }

      setProperties(items);
      setTotal(newTotal);
      setTotalPages(newTotalPages);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError("Không thể tải danh sách bất động sản. Vui lòng thử lại sau.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const goToPage = (target) => {
    if (target < 1 || target > totalPages || target === page || loading) return;
    fetchProperties(filters, target);
    // cuộn lên đầu danh sách (trừ phần navbar cố định)
    const top = resultsTopRef.current
      ? resultsTopRef.current.getBoundingClientRect().top + window.scrollY - 120
      : 0;
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  };
  const fetchTimer = useRef(null);

  const debouncedFetch = (updatedFilters) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => {
      fetchProperties(updatedFilters);
    }, 500);
  };

  const handleCheckboxChange = (category, value) => {
    const current = [...(filters[category] || [])];
    const index = current.indexOf(value);
    if (index === -1) {
      current.push(value);
    } else {
      current.splice(index, 1);
    }
    const updatedFilters = { ...filters, [category]: current };
    setFilters(updatedFilters);
    fetchProperties(updatedFilters);
  };

  const handlePriceChange = (e) => {
    const value = parseInt(e.target.value);
    const updatedFilters = { ...filters, maxPrice: value };
    setFilters(updatedFilters);
    debouncedFetch(updatedFilters);
  };

  const handleBhkSelect = (value) => {
    const updatedFilters = {
      ...filters,
      bhk: filters.bhk === value ? "" : value,
    };
    setFilters(updatedFilters);
    fetchProperties(updatedFilters);
  };

  const handleSortChange = (e) => {
    const newSort = e.target.value;
    const updatedFilters = { ...filters, sort: newSort };
    setFilters(updatedFilters);
    fetchProperties(updatedFilters);
  };

  const resetFilters = () => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    const reset = {
      city: "",
      propertyType: [],
      bhk: "",
      maxPrice: 50000000000,
      amenities: [],
      furnishing: [],
      sort: "latest",
    };
    setFilters(reset);
    navigate("/properties");
    fetchProperties(reset);
  };

  const [showMobileFilters, setShowMobileFilters] = useState(false);
  return (
    <div className={s.pageContainer}>
      <Navbar />
      <div className={s.container}>
        <div className={s.mobileFilterButtonWrapper}>
          <button
            onClick={() => setShowMobileFilters(true)}
            className={s.mobileFilterButton}
          >
            <HiFilter /> Bộ lọc và tìm kiếm
          </button>
        </div>
        <div className={s.layout}>
          <aside
            className={`${s.sidebar} ${showMobileFilters ? s.sidebarVisible : s.sidebarHidden}`}
          >
            <div className={s.sidebarHeader}>
              <div className={s.sidebarTitleWrapper}>
                <HiFilter className={s.sidebarTitleIcon} />
                <h2 className={s.sidebarTitle}>Bộ lọc</h2>
              </div>
              <div className={s.sidebarHeaderActions}>
                <button onClick={resetFilters} className={s.resetButton}>
                  Đặt lại
                </button>
                <button
                  className={s.closeMobileFilters}
                  onClick={() => setShowMobileFilters(false)}
                >
                  <HiX />
                </button>
              </div>
            </div>
            <div className={s.filtersScrollArea}>
              <div className={s.filterSection}>
                <label className={s.filterLabel}>Địa điểm</label>
                <div className={s.searchInputWrapper}>
                  <HiSearch className={s.searchIcon} />
                  <input
                    type="text"
                    placeholder="Tìm kiếm thành phố..."
                    value={filters.city}
                    onChange={(e) => {
                      const updatedFilters = {
                        ...filters,
                        city: e.target.value,
                      };
                      setFilters(updatedFilters);
                      debouncedFetch(updatedFilters);
                    }}
                    className={s.searchInput}
                  />
                </div>
              </div>

              {/* Price Range Section */}
              <div className={s.filterSection}>
                <div className={s.priceHeader}>
                  <label className={s.filterLabel}>Khoảng giá tối đa</label>
                  <span className={s.priceValue}>
                    {filters.maxPrice >= 1000000000
                      ? `${(filters.maxPrice / 1000000000).toFixed(1)} tỷ VND`
                      : `${(filters.maxPrice / 1000000).toLocaleString()} triệu VND`}
                  </span>
                </div>

                <input
                  type="range"
                  min="1000000"
                  max="50000000000"
                  step="1000000"
                  onChange={handlePriceChange}
                  className={s.priceSlider}
                />

                <div className={s.priceLabels}>
                  <span>1 Tr</span>
                  <span>50 Tỷ</span>
                </div>
              </div>

              {/* property Type */}
              <div className={s.filterSection}>
                <label className={s.filterLabel}>Loại bất động sản</label>
                <div className={s.checkboxGroup}>
                  {propertyTypes.map((type) => (
                    <label key={type.value} className={s.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={filters.propertyType.includes(type.value)}
                        onChange={() =>
                          handleCheckboxChange("propertyType", type.value)
                        }
                        className={s.checkbox}
                      />
                      {type.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* BHK */}
              <div className={s.filterSection}>
                <label className={s.filterLabel}>BHK (Phòng ngủ)</label>
                <div className={s.bhkGroup}>
                  {bhkOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleBhkSelect(option)}
                      className={`${s.bhkButton} ${
                        filters.bhk === option
                          ? s.bhkButtonActive
                          : s.bhkButtonInactive
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className={s.filterSection}>
                <label className={s.filterLabel}>Nội thất</label>
                <div className={s.checkboxGroup}>
                  {furnishingOptions.map((option) => (
                    <label key={option.value} className={s.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={filters.furnishing?.includes(option.value)}
                        onChange={() =>
                          handleCheckboxChange("furnishing", option.value)
                        }
                        className={s.checkbox}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* main content */}

          <main ref={resultsTopRef} className={s.mainContent}>
            <RecommendedProperties
              key={user?._id || "guest"}
              wishlistedIds={wishlistedIds}
              onToggleWishlist={handleToggleWishlist}
            />
            <div className={s.contentHeader}>
              <div>
                <span className={s.resultCount}>
                  Tìm thấy{" "}
                  <strong className={s.resultCountStrong}>
                    {loading ? "..." : total}
                  </strong>{" "}
                  Bất động sản
                </span>
              </div>
              <div className={s.headerControls}>
                <div className={s.viewModeToggle}>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`${s.viewModeButton} ${
                      viewMode === "grid"
                        ? s.viewModeActive
                        : s.viewModeInactive
                    }`}
                  >
                    <HiViewGrid size={20} />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`${s.viewModeButton} ${
                      viewMode === "list"
                        ? s.viewModeActive
                        : s.viewModeInactive
                    }`}
                  >
                    <HiViewList size={20} />
                  </button>
                </div>
                <div className={s.sortControl}>
                  <span className={s.sortLabel}>Sắp xếp:</span>
                  <Select
                    value={filters.sort}
                    onChange={handleSortChange}
                    className={s.sortSelect}
                    ariaLabel="Sắp xếp"
                    options={[
                      { value: "latest", label: "Mới nhất" },
                      { value: "priceLow", label: "Giá: Thấp đến Cao" },
                      { value: "priceHigh", label: "Giá: Cao đến Thấp" },
                    ]}
                  />
                </div>
              </div>
            </div>
            {/* property grid */}
            {loading ? (
              <div className={s.skeletonGrid}>
                {Array.from({ length: PAGE_SIZE }, (_, i) => (
                  <div key={i} className={s.skeletonCard}></div>
                ))}
              </div>
            ) : error ? (
              <div className={s.errorContainer}>
                <HiX size={48} className={s.errorIcon} />
                <h3 className={s.errorTitle}>{error}</h3>
                <button
                  onClick={() => fetchProperties(filters, page)}
                  className={s.errorButton}
                >
                  Thử lại
                </button>
              </div>
            ) : properties.length === 0 ? (
              <div className={s.emptyContainer}>
                <div className={s.emptyIconWrapper}>
                  <HiAdjustments size={32} className={s.emptyIcon} />
                </div>
                <h2 className={s.emptyTitle}>Không tìm thấy BĐS</h2>
                <p className={s.emptyText}>Mở rộng phạm vi tìm kiếm</p>
                <button onClick={resetFilters} className={s.emptyButton}>
                  Làm mới
                </button>
              </div>
            ) : (
              <>
                <div
                  className={`${s.propertyList} ${
                    viewMode === "grid" ? s.propertyListGrid : s.propertyListList
                  }`}
                >
                  {properties
                    .filter((p) => p)
                    .map((p) => (
                      <PropertyCard
                        key={p._id}
                        property={p}
                        isWishlisted={wishlistedIds.includes(String(p._id))}
                        onToggleWishlist={handleToggleWishlist}
                      />
                    ))}
                </div>

                {/* phân trang */}
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                  from={(page - 1) * PAGE_SIZE + 1}
                  to={(page - 1) * PAGE_SIZE + properties.length}
                  total={total}
                />
              </>
            )}
          </main>
        </div>
      </div>
      {showMobileFilters && (
        <div
          onClick={() => setShowMobileFilters(false)}
          className={s.mobileOverlay}
        />
      )}
    </div>
  );
};

export default Properties;
