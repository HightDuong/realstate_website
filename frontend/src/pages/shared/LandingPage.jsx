import React, { useEffect, useState } from "react";
import { landingPageStyles as s } from "../../assets/dummyStyles";
import Navbar from "../../components/common/Navbar";
import {
  HiLocationMarker,
  HiHome,
  HiOfficeBuilding,
  HiShieldCheck,
  HiLightningBolt,
  HiCurrencyDollar,
  HiVideoCamera,
  HiSearch,
  HiMail,
  HiPhone,
} from "react-icons/hi";
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaTwitter,
} from "react-icons/fa";
import { useNavigate ,Link} from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import axios from "axios";
import API_URL from "../../config";
import banner from "../../assets/bannerimage.png";
import PropertyCard from "../../components/common/PropertyCard";
import Select from "../../components/common/Select";
import logo from "../../assets/hexagonlogo1.png";

const LandingPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [propertyType, setPropertyType] = useState("Select Type");
  const [propertyCounts, setPropertyCounts] = useState({
    flat: 0,
    villa: 0,
    penthouse: 0,
    commercial: 0,
  });
  const [wishlistedIds, setWishlistedIds] = useState([]);

  useEffect(() => {
    fetchProperties();
    fetchCounts();
    if (user) {
      fetchWishlist();
    }
  }, [user]);
  // const fetchWishlist = async () => {
  //   try {
  //     const res = await axios.get(`${API_URL}api/wishlist`, {
  //       headers: {
  //         Authorization: `Bearer ${token}`,
  //       },
  //     });
  //     setWishlistedIds(
  //       res.data
  //         .filter((item) => item.property)
  //         .map((item) => item.property._id),
  //     );
  //   } catch (error) {
  //     console.error("Lỗi khi tải danh sách yêu thích", error);
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

  //to remove a wishlist item
  // const handleToggleWishlist = async (propertyId) => {
  //   try {
  //     const isWishlisted = wishlistedIds.includes(propertyId);
  //     if (isWishlisted) {
  //       await axios.delete(`${API_URL}api/wishlist/${propertyId}`, {
  //         headers: {
  //           Authorization: `Bearer ${token}`,
  //         },
  //       });
  //       setWishlistedIds((prev) => prev.filter((id) => id !== propertyId));
  //     } else {
  //       await axios.post(
  //         `${API_URL}api/wishlist/${propertyId}`,
  //         {},
  //         {
  //           headers: {
  //             Authorization: `Bearer ${token}`,
  //           },
  //         },
  //       );
  //       //to add
  //       setWishlistedIds((prev) => [...prev, propertyId]);
  //     }
  //   } catch (error) {
  //     console.error("Lỗi khi xóa khỏi danh sách yêu thích", error);
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

  //to fetch counts
  const fetchCounts = async () => {
    try {
      const res = await axios.get(`${API_URL}api/property/count`);
      if (res.data.success) {
        setPropertyCounts(res.data.counts);
      }
    } catch (error) {
      console.error("Failed to fetch property counts", error);
    }
  };

  //to fetch properties
  const fetchProperties = async (search = "") => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}api/property?city=${encodeURIComponent(search)}`);
      // setProperties(res.data.properties || res.data || []);
      // console.log("Dữ liệu API trả về:", res.data); // THÊM DÒNG NÀY
      setProperties(
        Array.isArray(res.data?.properties)
          ? res.data.properties
          : Array.isArray(res.data)
            ? res.data
            : [],
      );
      setError(null);
    } catch (error) {
      setError("Không thể tải danh sách bất động sản. Vui lòng thử lại!");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchTerm) params.append("city", searchTerm);
    if (propertyType !== "Select Type") params.append("type", propertyType);
    navigate(`/properties?${params.toString()}`);
  };

  const categories = [
    {
      name: "Căn hộ hiện đại",
      count: propertyCounts.flat || 0,
      icon: <HiOfficeBuilding size={32} />,
      type: "flat",
    },
    {
      name: "Biệt thự cao cấp",
      count: propertyCounts.villa || 0,
      icon: <HiHome size={32} />,
      type: "villa",
    },
    {
      name: "Penthouse",
      count: propertyCounts.penthouse || 0,
      icon: <HiOfficeBuilding size={32} />,
      type: "penthouse",
    },
    {
      name: "Mặt bằng thương mại",
      count: propertyCounts.commercial || 0,
      icon: <HiOfficeBuilding size={32} />,
      type: "commercial",
    },
  ];

  const features = [
    {
      title: "Uy tín đã kiểm chứng",
      desc: "Mọi tin đăng đều được kiểm duyệt chặt chẽ về quyền sở hữu, hiện trạng và tính pháp lý.",
      icon: <HiShieldCheck size={24} />,
    },
    {
      title: "Tìm kiếm thông minh",
      desc: "Thuật toán AI giúp bạn tìm ra những lựa chọn phù hợp nhất dựa trên nhu cầu cá nhân.",
      icon: <HiLightningBolt size={24} />,
    },
    {
      title: "Giá trị tốt nhất",
      desc: "Tin đăng trực tiếp từ chủ sở hữu, không qua trung gian, đảm bảo mức giá cạnh tranh.",
      icon: <HiCurrencyDollar size={24} />,
    },
    {
      title: "Tham quan ảo",
      desc: "Trải nghiệm bất động sản qua tour 3D độ nét cao ngay tại nhà.",
      icon: <HiVideoCamera size={24} />,
    },
  ];

  return (
    <div className={s.bgMain}>
      <Navbar />
      {/* hero section */}
      <section className={s.heroSection}>
        <div className={s.heroContent}>
          <span className={s.badge}>Với hơn 20000 người tin dùng</span>
          <h1 className={s.heroTitle}>
            Khám phá <span className={s.textGradient}>nơi an cư lý tưởng </span>
            cho hành trình mới.
          </h1>
          <p className={s.heroSubtitle}>
            Trải nghiệm nền tảng tìm kiếm bất động sản tiên tiến nhất. Khám phá
            những danh sách nhà đất đã được xác thực, kết nối với các chuyên gia
            hàng đầu và tìm thấy nơi bạn thuộc về.
          </p>
          <form onSubmit={handleSearch} className={s.searchForm}>
            <div className={s.searchField}>
              <div className={s.textPrimary}>
                <HiLocationMarker size={26} />
              </div>
              <div className={s.flexCol}>
                <label className={s.labelSmall}>Địa điểm</label>
                <input
                  type="text"
                  placeholder="Bạn muốn tìm ở khu vực nào?"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={s.inputTransparent}
                />
              </div>
            </div>
            <div className={s.searchDivider}></div>
            <div className={s.searchField}>
              <div className={s.textPrimary}>
                <HiHome size={26} />
              </div>
              <div className={s.flexCol}>
                <label className={s.labelSmall}>Loại bất động sản</label>
                <Select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className={s.inputTransparent}
                  ariaLabel="Loại bất động sản"
                  options={[
                    { value: "Select Type", label: "Chọn loại" },
                    { value: "flat", label: "Căn hộ / Chung cư" },
                    { value: "villa", label: "Biệt thự / Nhà ở" },
                    { value: "penthouse", label: "Penthouse" },
                    { value: "commercial", label: "Văn phòng & cửa hàng" },
                  ]}
                />
              </div>
            </div>
            <button type="submit" className={s.searchButton}>
              <HiSearch size={22} /> Tìm kiếm
            </button>
          </form>
          {/* stats */}
          <div className={s.statsContainer}>
            <div className={s.statItemFlex}>
              <h3 className={s.statNumber}>12k+</h3>
              <p className={s.statLabel}>Bất động sản sẵn sàng bàn giao</p>
            </div>
            <div className={s.statItemBorder}>
              <h3 className={s.statNumber}>500+</h3>
              <p className={s.statLabel}>Mạng lưới môi giới</p>
            </div>
            <div className={s.statItemBorder}>
              <h3 className={s.statNumber}>4.9/5</h3>
              <p className={s.statLabel}>Đánh giá từ người dùng</p>
            </div>
          </div>
        </div>
        {/* hero image */}
        <div className={s.heroImageContainer}>
          <div className={s.imageWrapper}>
            <img src={banner} alt="banner" className={s.heroImage} />
            <div className={s.verifiedBadge}>
              <div className={s.badgeIconWrapper}>
                <HiShieldCheck size={24} className="text-primary" />
              </div>
              <div>
                <h4 className={s.badgeTitle}>Danh sách đã kiểm duyệt</h4>
                <p className={s.badgeText}>
                  Được thẩm định bởi đội ngũ chuyên viên
                </p>
              </div>
              <span className={s.preApproved}>Đã duyệt sơ bộ</span>
            </div>
          </div>
        </div>
      </section>

      {/* category section*/}
      <section className={s.categorySection}>
        <div className={s.container}>
          <div className={s.categoryHeader}>
            <div className={s.categoryHeaderText}>
              <h2 className={s.categoryTitle}>Tìm kiếm theo loại</h2>
              <p className={s.categoryDesc}>
                Khám phá bộ sưu tập bất động sản được tuyển chọn kỹ lưỡng, phù
                hợp với phong cách sống và nhu cầu riêng biệt của bạn.
              </p>
            </div>
          </div>
          <div className={s.categoryGrid}>
            {categories.map((cat, idx) => (
              <div
                key={idx}
                className={s.categoryCard}
                onClick={() => navigate(`/properties?type=${cat.type}`)}
              >
                <div className={s.categoryIconWrapper}>{cat.icon}</div>
                <h3 className={s.categoryName}>{cat.name}</h3>
                <p className={s.categoryCount}>
                  {cat.count.toLocaleString()} Bất động sản
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* features sections */}
      <section className={s.featuredSection}>
        <div className={s.featuresContainer}>
          <div className={s.featuresList}>
            {features.map((f, idx) => (
              <div
                key={idx}
                className={s.featureCard}
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div className={s.featureIconWrapper}>{f.icon}</div>
                <h3 className={s.featureTitle}>{f.title}</h3>
                <p className={s.featureDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
          <div className={s.featuresContent}>
            <h2 className={s.featuresHeading}>
              Tại sao RealEstate <br />
              là{" "}
              <span className={s.textGradient}>
                sự lựa chọn ưu tiên hàng đầu
              </span>
            </h2>
            <p className={s.featuresSubtext}>
              Chúng tôi đã tái định nghĩa trải nghiệm tìm kiếm bất động sản từ
              nền tảng cốt lõi. Bằng việc tập trung vào tính minh bạch, công
              nghệ tiên tiến và thiết kế lấy người dùng làm trung tâm, chúng tôi
              giúp bạn tìm thấy không chỉ một ngôi nhà, mà là một tổ ấm thực sự
            </p>
            <ul className={s.featuresListItems}>
              {[
                "Kết nối trực tiếp với đội ngũ môi giới được chứng nhận",
                "Dữ liệu định giá thị trường theo thời gian thực",
                "Hệ thống quản lý tài liệu bảo mật",
                "Hỗ trợ khách hàng cao cấp 24/7",
              ].map((item, idx) => (
                <li key={idx} className={s.listItem}>
                  <HiLightningBolt className="text-primary" /> {item}
                </li>
              ))}
            </ul>
            <a href="#process" className={s.learnMoreLink}>
              Khám phá quy trình &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="process" className={s.processSection}>
        <div className={s.container}>
          <div className={s.processHeader}>
            <span className={s.processBadge}>Hoạt động ra sao</span>
            <h2 className={s.processTitle}>Nền tảng vận hành liền mạch</h2>
            <p className={s.processSubtitle}>
              Chúng tôi đã đơn giản hóa hành trình tìm kiếm ngôi nhà mơ ước của
              bạn thành ba bước rõ ràng và hoàn toàn thảnh thơi
            </p>
          </div>
          <div className={s.processGrid}>
            {[
              {
                step: "01",
                title: "Tìm kiếm thông minh",
                desc: "Tận dụng công nghệ tìm kiếm thông minh ứng dụng AI để tìm ra những bất động sản phù hợp nhất với nhu cầu và sở thích của bạn.",
                icon: <HiLightningBolt size={32} />,
              },
              {
                step: "02",
                title: "Tham quan trực tuyến",
                desc: "Trải nghiệm ngôi nhà tương lai của bạn ở bất kỳ đâu với các chuyến tham quan 3D chất lượng cao và không gian xem thực tế sống động.",
                icon: <HiVideoCamera size={32} />,
              },
              {
                step: "03",
                title: "Xác thực đáng tin cậy",
                desc: "Mỗi tin đăng đều được kiểm tra kỹ lưỡng về quyền sở hữu và tình trạng thực tế, mang đến sự an tâm và giao dịch an toàn cho bạn.",
                icon: <HiShieldCheck size={32} />,
              },
            ].map((p, idx) => (
              <div key={idx} className={s.processCard}>
                <div className={s.stepNumber}>{p.step}</div>
                <div className={s.processIconWrapper}>{p.icon}</div>
                <h3 className={s.processCardTitle}>{p.title}</h3>
                <p className={s.processCardDesc}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.featuredSection}>
        <div className={s.container}>
          <div className={s.featuredHeader}>
            <span className={s.featuredBadge}>Được tuyển chọn kỹ lưỡng </span>
            <h2 className={s.featureTitle}>Bộ Sưu Tập Nổi Bật</h2>
            <p className={s.featuredSubtitle}>
              Khám phá những bất động sản giá trị cao được các chuyên gia tuyển
              chọn kỹ lưỡng dựa trên thiết kế độc đáo, vị trí đắc địa và tiềm
              năng đầu tư vượt trội.
            </p>
          </div>
          {loading ? (
            <div className={s.loadingContainer}>
              <div className={s.loader}></div>
            </div>
          ) : error ? (
            <div className={s.errorContainer}>
              <p>{error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {properties
                .filter((p) => p)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 6)
                .map((property) => (
                  <PropertyCard
                    key={property._id}
                    property={property}
                    isWishlisted={wishlistedIds.includes(String(property._id))}
                    onToggleWishlist={handleToggleWishlist}
                  />
                ))}
            </div>
          )}

          <div className={s.discoverButtonContainer}>
            <button
              onClick={() => navigate("/properties")}
              className={s.discoverButton}
            >
              Xem thêm
            </button>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className={s.footer}>
        <div className={s.container}>
          <div className={s.footerMainGrid}>
            <div className={s.footerBrand}>
              <div className={s.brandLogo}>
                <div className={s.brandIcon}>RE</div>
                RealEstate
              </div>
              <p className={s.brandDesc}>
                Nền tảng đáng tin cậy nhất để mua, bán và thuê bất động sản cao
                cấp trên toàn cầu. Chúng tôi giúp hành trình tìm kiếm bất động
                sản trở nên dễ dàng và xuyên suốt
              </p>

              <div className={s.socialIcons}>
                {[FaFacebookF, FaTwitter, FaInstagram, FaLinkedinIn].map(
                  (Icon, idx) => (
                    <a href="#" key={idx} className={s.socialIcon}>
                      <Icon size={16} />
                    </a>
                  ),
                )}
              </div>
            </div>
            {/* Column 2: Quick Links */}
            <div>
              <h4 className={s.footerHeading}>Danh mục</h4>
              <ul className={s.footerLinks}>
                <li>
                  <a href="/" className={s.footerLink}>
                    Trang chủ
                  </a>
                </li>
                <li>
                  <a href="/properties" className={s.footerLink}>
                    Bất động sản
                  </a>
                </li>
                <li>
                  <a href="/wishlist" className={s.footerLink}>
                    Yêu thích
                  </a>
                </li>
                <li>
                  <a href="/contact" className={s.footerLink}>
                    Liên hệ
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Contact Info */}
            <div>
              <h4 className={s.footerHeading}>Hỗ trợ</h4>
              <ul className={s.footerLinks}>
                <li className={s.contactInfo}>
                  <HiMail className="text-primary text-xl" />{" "}
                  contact@reestate.com
                </li>
                <li className={s.contactInfo}>
                  <HiPhone className="text-primary text-xl" /> +85 1234567890
                </li>
                <li className={s.contactInfoStart}>
                  <HiLocationMarker
                    className={`text-primary ${s.contactIcon}`}
                  />
                  123 Business Duong , VietNam
                </li>
              </ul>
            </div>

            {/* colume 4 */}
            <div>
              <h4 className={s.footerHeading}>Tin tức</h4>
              <p className={s.newsletterDesc}>
                Đăng ký để nhận danh sách bất động sản mới nhất và thông tin thị
                trường trực tiếp qua email của bạn.
              </p>
              <div className={s.newsletterInputWrapper}>
                <input
                  type="email"
                  placeholder="Nhập email của bạn"
                  className={s.newsletterInput}
                />
                <button className={s.newsletterButton}>Tham gia</button>
              </div>
            </div>
          </div>
          {/* bottom bar */}
          <div className={s.bottomBar}>
            <div className={s.bottomBarFlex}>
              <p>
                &copy; {new Date().getFullYear()} RealEstate. Bảo lưu mọi quyền
              </p>
              <div className={s.footerLegalLinks}>
                <a href="#" className={s.footerLink}>
                  Chính sách bảo mật
                </a>
                <a href="#" className={s.footerLink}>
                  Điều khoản dịch vụ
                </a>
                <a href="#" className={s.footerLink}>
                  Cài đặt Cookies
                </a>
              </div>
            </div>
            <div className={s.designCredit}>
              <img src={logo} alt="logo" className={s.designLogo} />
              <span className="text-text-muted">Thiết kế bởi</span>
              <a
                href="https://hexagondigitalservices.com"
                target="_blank"
                className={s.designLink}
              >
                Hexagon Digital Services
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
