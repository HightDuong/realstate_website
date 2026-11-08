import React, { useEffect, useState } from "react";
import { editPropertyStyles as s } from "../../assets/dummyStyles";
import Select from "../../components/common/Select";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import API_URL from "../../config";
import { FaSlack } from "react-icons/fa";
import { HiUpload, HiX } from "react-icons/hi";
import AiListingWriter from "../../components/ai/AiListingWriter";

const EditProperty = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [newImagePreviews, setNewImagePreviews] = useState([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    city: "",
    area: "",
    pincode: "",
    propertyType: "flat",
    bhk: "",
    bathrooms: "",
    areaSize: "",
    furnishing: "unfurnished",
    status: "sale",
    amenities: [],
    securityDeposit: "",
    maintenance: "",
  });

  const commonAmenities = [
    "Bãi đậu xe",
    "Hồ bơi",
    "Phòng Gym",
    "An ninh 24/7",
    "Wifi / Internet",
    "Điện dự phòng",
    "Khu sinh hoạt chung",
    "Sân vườn / Cảnh quan",
  ];

  //to fetch the property
  //   useEffect(() => {
  //     const fetchProperty = async () => {
  //       try {
  //         const res = await axios.get(`${API_URL}api/property/${id}`);
  //         const p = res.data.property;
  //         setFormData({
  //           title: p.title || "",
  //           description: p.description || "",
  //           price: p.price || "",
  //           city: p.city || "",
  //           area: p.area || "",
  //           pincode: p.pincode || "",
  //           propertyType: p.propertyType || "flat",
  //           bhk: p.bhk || "",
  //           bathrooms: p.bathrooms || "",
  //           areaSize: p.areaSize || "",
  //           furnishing: p.furnishing || "unfurnished",
  //           status: p.status || "sale",
  //           amenities: p.amenities || [],
  //           securityDeposit: p.securityDeposit || "",
  //           maintenance: p.maintenance || "",
  //         });
  //         setExistingImages(p.images || []);
  //         setLoading(false);
  //       } catch (error) {
  //         setError("Tải thông tin BĐS thất bại!");
  //         setLoading(false);
  //       }
  //     };
  //     fetchProperty();
  //   },[id]);

  useEffect(() => {
    if (!id) {
      setError("Không tìm thấy ID bất động sản");
      setLoading(false);
      return;
    }

    const fetchProperty = async () => {
      try {
        setLoading(true);
        setError(null);

        // gửi token để backend nhận ra chủ tin → không tính là lượt xem
        const res = await axios.get(`${API_URL}api/property/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Kiểm tra cấu trúc response
        const p = res.data?.property || res.data; // ← an toàn hơn

        if (!p) {
          throw new Error("Không tìm thấy thông tin bất động sản");
        }

        setFormData({
          title: p.title || "",
          description: p.description || "",
          price: p.price || "",
          city: p.city || "",
          area: p.area || "",
          pincode: p.pincode || "",
          propertyType: p.propertyType || "flat",
          bhk: p.bhk || "",
          bathrooms: p.bathrooms || "",
          areaSize: p.areaSize || "",
          furnishing: p.furnishing || "unfurnished",
          status: p.status || "sale",
          amenities: Array.isArray(p.amenities) ? p.amenities : [],
          securityDeposit: p.securityDeposit || "",
          maintenance: p.maintenance || "",
        });

        setExistingImages(p.images || []);
      } catch (error) {
        console.error("Fetch property error:", error);
        setError(
          error.response?.data?.message || "Tải thông tin BĐS thất bại!",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchProperty();

    // Cleanup function (tùy chọn)
    return () => {
      // Có thể cancel request nếu dùng axios cancel token
    };
  }, [id, token]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAmenityChange = (amenity) => {
    setFormData((prev) => {
      const current = prev.amenities || [];
      if (current.includes(amenity)) {
        return { ...prev, amenities: current.filter((a) => a !== amenity) };
      } else {
        return { ...prev, amenities: [...current, amenity] };
      }
    });
  };

  const handleNewImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (existingImages.length + newImages.length + files.length > 10) {
      setError("Số lượng ảnh không được vượt quá 10!");
      return;
    }
    setNewImages((prev) => [...prev, ...files]);
    const previews = files.map((file) => URL.createObjectURL(file));
    setNewImagePreviews((prev) => [...prev, ...previews]);
  };

  const removeExistingImage = (url) => {
    setExistingImages(existingImages.filter((img) => img !== url));
  };

  const removeNewImage = (index) => {
    setNewImages(newImages.filter((_, i) => i !== index));
    setNewImagePreviews(newImagePreviews.filter((_, i) => i !== index));
  };

  //to submit the updated listing
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const data = new FormData();
    Object.keys(formData).forEach((key) => {
      if (key === "amenities") {
        data.append("amenities", JSON.stringify(formData[key]));
      } else if (key === "securityDeposit" || key === "maintenance") {
        data.append(key, formData[key] || 0);
      } else {
        data.append(key, formData[key]);
      }
    });
    data.append("existingImages", JSON.stringify(existingImages));
    newImages.forEach((img) => data.append("images", img));

    try {
      const res = await axios.put(`${API_URL}api/property/${id}`, data, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });
      // sửa tiêu đề/mô tả/ảnh hoặc tin bị từ chối → được gửi duyệt lại
      if (res.data?.message) alert(res.data.message);
      navigate("/dashboard");
    } catch (error) {
      setError(error.response?.data?.message || "Cập nhật BĐS thất bại!");
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="loader-full-page">
        <div className="loader"></div>
      </div>
    );

  return (
    <div className={s.pageContainer}>
      <div className={s.innerContainer}>
        <div className={s.headerWrapper}>
          <h1 className={s.pageTitle}>Chỉnh sửa BĐS</h1>
          <p className={s.pageSubtitle}>Cập nhật thông tin BĐS của bạn!</p>
        </div>

        <form onSubmit={handleSubmit} className={s.formContainer}>
          {error && (
            <div
              style={{
                padding: "1rem",
                background: "#fee2e2",
                color: "#dc2626",
                borderRadius: "0.75rem",
                marginBottom: "2rem",
              }}
            >
              {error}
            </div>
          )}

          <div className={s.section}>
            <div className={s.sectionHeader}>
              <div className={s.sectionIndicator}></div>
              <h3 className={s.sectionTitle}>Nội dung & Mô tả</h3>
              <AiListingWriter
                formData={formData}
                existingImages={existingImages}
                newImages={newImages}
                amenityOptions={commonAmenities}
                onApply={({ title, description, amenities }) =>
                  setFormData((prev) => ({
                    ...prev,
                    title,
                    description,
                    amenities: [...new Set([...(prev.amenities || []), ...amenities])],
                  }))
                }
              />
            </div>
            <div className={s.sectionContent}>
              <div>
                <label className={s.label}>Tiêu đề</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="Nhập nội dung..."
                  className={s.input}
                  required
                />
              </div>

              <div>
                <label className={s.label}>Chi tiết mô tả</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Nhập nội dung..."
                  className={s.textarea}
                  maxLength={5000}
                  required
                ></textarea>
              </div>
            </div>
          </div>

          <div className={s.twoColumnGrid}>
            {/* Section 2: Chi tiết bất động sản */}
            <div>
              <div className={s.sectionHeader}>
                <div className={s.sectionIndicator}></div>
                <h3 className={s.sectionTitle}>Chi tiết bất động sản</h3>
              </div>

              <div className={s.sectionContent}>
                <div>
                  <label className={s.label}>Loại bất động sản</label>

                  <Select
                    name="propertyType"
                    value={formData.propertyType}
                    onChange={handleInputChange}
                    className={s.select}
                    options={[
                      { value: "flat", label: "Căn hộ / Chung cư" },
                      { value: "villa", label: "Nhà riêng / Biệt thự" },
                      { value: "penthouse", label: "Penthouse" },
                      { value: "commercial", label: "Thương mại" },
                    ]}
                  />
                </div>

                <div className={s.threeColumnGrid}>
                  <div>
                    <label className={s.label}>Số phòng ngủ (BHK)</label>

                    <input
                      type="number"
                      name="bhk"
                      value={formData.bhk}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: 3"
                      className={s.input}
                    />
                  </div>

                  <div>
                    <label className={s.label}>Số phòng tắm</label>

                    <input
                      type="number"
                      name="bathrooms"
                      value={formData.bathrooms || ""}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: 2"
                      className={s.input}
                    />
                  </div>

                  <div>
                    <label className={s.label}>Diện tích (m²)</label>

                    <input
                      type="number"
                      name="areaSize"
                      value={formData.areaSize}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: 150"
                      className={s.input}
                      required
                    />
                  </div>
                </div>

                <div className={s.twoColumnGridInner}>
                  <div>
                    <label className={s.label}>Tình trạng nội thất</label>

                    <Select
                      name="furnishing"
                      value={formData.furnishing}
                      onChange={handleInputChange}
                      className={s.select}
                      options={[
                        { value: "unfurnished", label: "Không nội thất" },
                        { value: "semi-furnished", label: "Nội thất cơ bản" },
                        { value: "furnished", label: "Đầy đủ nội thất" },
                      ]}
                    />
                  </div>

                  <div>
                    <label className={s.label}>Trạng thái tin đăng</label>

                    <Select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className={s.select}
                      options={[
                        { value: "sale", label: "Đang mở bán" },
                        { value: "sold", label: "Đã bán" },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Giá bán & Vị trí */}
            <div>
              <div className={s.sectionHeader}>
                <div className={s.sectionIndicator}></div>
                <h3 className={s.sectionTitle}>Giá bán & Vị trí</h3>
              </div>

              <div className={s.sectionContent}>
                <div>
                  <label className={s.label}>Giá bán (VNĐ)</label>

                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="Ví dụ: 5000000000"
                    className={s.input}
                    required
                  />
                </div>

                <div className={s.twoColumnGridInner}>
                  <div>
                    <label className={s.label}>Thành phố</label>

                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: Hà Nội"
                      className={s.input}
                      required
                    />
                  </div>

                  <div>
                    <label className={s.label}>Mã bưu chính</label>

                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: 100000"
                      className={s.input}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className={s.label}>Khu vực cụ thể</label>

                  <input
                    type="text"
                    name="area"
                    value={formData.area}
                    onChange={handleInputChange}
                    placeholder="Ví dụ: Cầu Giấy"
                    className={s.input}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={s.section}>
            <div className={s.sectionHeader}>
              <div className={s.sectionIndicator}></div>
              <h3 className={s.sectionTitle}>Tiện ích</h3>
            </div>
            <div className={s.amenitiesGrid}>
              {commonAmenities.map((amenity) => (
                <label
                  key={amenity}
                  className={s.amenityLabel(
                    formData.amenities.includes(amenity),
                  )}
                >
                  <input
                    type="checkbox"
                    checked={formData.amenities.includes(amenity)}
                    onChange={() => handleAmenityChange(amenity)}
                    className={s.amenityCheckbox}
                  />

                  <span
                    className={s.amenityText(
                      formData.amenities.includes(amenity),
                    )}
                  >
                    {amenity}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 5: Quản lý hình ảnh */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <div className={s.sectionIndicator}></div>
              <h3 className={s.sectionTitle}>Quản lý hình ảnh</h3>
            </div>

            <div className={s.imageGrid}>
              {/* Hình ảnh hiện có */}
              {existingImages.map((src, i) => (
                <div key={`existing-${i}`} className={s.imageCard}>
                  <img src={src} alt="Ảnh hiện có" className={s.imageCardImg} />

                  <button
                    type="button"
                    onClick={() => removeExistingImage(src)}
                    className={s.removeImageBtn}
                  >
                    <HiX size={12} />
                  </button>

                  <div className={s.imageBadgeExisting}>ẢNH HIỆN CÓ</div>
                </div>
              ))}

              {/* Xem trước ảnh mới */}
              {newImagePreviews.map((src, i) => (
                <div key={`new-${i}`} className={s.imageCardNew}>
                  <img src={src} alt="Ảnh xem trước" className={s.imageCardImg} />

                  <button
                    type="button"
                    onClick={() => removeNewImage(i)}
                    className={s.removeImageBtn}
                  >
                    <HiX size={12} />
                  </button>

                  <div className={s.imageBadgeNew}>ẢNH MỚI</div>
                </div>
              ))}

              {/* Nút tải ảnh lên */}
              {existingImages.length + newImages.length < 10 && (
                <div className={s.uploadCard}>
                  <input
                    type="file"
                    multiple
                    onChange={handleNewImageChange}
                    className={s.uploadInput}
                    accept="image/*"
                  />

                  <HiUpload size={22} color="#64748b" />

                  <span className={s.uploadText}>Thêm hình ảnh</span>
                </div>
              )}
            </div>
          </div>

          <div className={s.formActions}>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className={s.cancelButton}
            >
              Hủy
            </button>
            <button
              type="submit"
              className={s.submitButton}
              disabled={submitting}
            >
              {submitting ? "Đang cập nhật..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProperty;
