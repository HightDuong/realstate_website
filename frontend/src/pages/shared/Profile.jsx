import React, { useState } from "react";
import { profileStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../components/common/Navbar";
import axios from "axios";
import API_URL from "../../config";
import {
  HiCheck,
  HiOutlineLocationMarker,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineUser,
  HiX,
} from "react-icons/hi";

const Profile = () => {
  const { user, setUser, token } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [removeProfilePic, setRemoveProfilePic] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    address: user?.address || "",
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "phone") {
      //chi 10 so
      const numericValue = value.replace(/\D/g, "").slice(0, 10);
      setFormData({ ...formData, [name]: numericValue });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setRemoveProfilePic(false);
    }
  };

  //to update your profile
  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = new FormData();
      data.append("name", formData.name);
      data.append("phone", formData.phone);
      data.append("address", formData.address);
      if (imageFile) {
        data.append("profilePic", imageFile);
      }
      if (removeProfilePic) {
        data.append("removeProfilePic", "true");
      }

      const res = await axios.put(`${API_URL}api/user/profile`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      if (res.data.success) {
        const updateUser = res.data.user;
        setUser(updateUser);
        localStorage.setItem("user", JSON.stringify(updateUser));
        setIsEditing(false);
        setImageFile(null);
        setImagePreview(null);
      }
    } catch (error) {
      setError(error.response?.data?.message || "Cập nhật thất bại");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={s.containerWrapper(user?.role)}>
      {user?.role !== "seller" && <Navbar />}
      <div className={s.mainContainer(user?.role)}>
        <header className={s.header}>
          <h1 className={s.pageTitle}>Thông tin người dùng</h1>
          <p className={s.pageSubtitle}>
            Quản lý thông tin của bạn và cài đặt tài khoản
          </p>
        </header>

        <div className={s.card}>
          <div className={s.profileHeader}>
            <div className={s.avatarSection}>
              <div className={s.avatarWrapper}>
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="preview"
                    className={s.avatarImage}
                  />
                ) : !removeProfilePic && user?.profilePic ? (
                  <img
                    src={user.profilePic}
                    alt="pic"
                    className={s.avatarImage}
                  />
                ) : (
                  <span className={s.avatarPlaceholder}>
                    {user?.name?.[0]?.toUpperCase() || "U"}
                  </span>
                )}
              </div>

              {isEditing && (
                <>
                  <label className={s.uploadButton}>
                    <input
                      type="file"
                      onChange={handleImageChange}
                      className="hidden"
                      accept="image/*"
                    />
                    <HiOutlineUser size={20} />
                  </label>
                  {(imagePreview ||
                    (!removeProfilePic && user?.profilePic)) && (
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        setImageFile(null);
                        setRemoveProfilePic(true);
                      }}
                      className={s.removeButton}
                      title="Xóa ảnh đại diện"
                    >
                      <HiX size={20} />
                    </button>
                  )}
                </>
              )}
            </div>
            <div>
              <h2 className={s.userName}>{user?.name}</h2>
              <span className={s.roleBadge}>{user?.role?.toUpperCase()}</span>
            </div>
          </div>
          {error && <div className={s.errorMessage}>{error}</div>}

          {isEditing ? (
            <form onSubmit={handleUpdate} className={s.editForm}>
              <div>
                <label className={s.label}>Họ và tên</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={s.input}
                  required
                />
              </div>
              <div>
                <label className={s.label}>Số điện thoại</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  maxLength="10"
                  pattern="\d{10}"
                  className={s.input}
                  placeholder="Nhập số điện thoại của bạn"
                />
              </div>

              <div>
                <label className={s.label}>Địa chỉ</label>
                <textarea
                  name="address"
                  value={formData.address}
                  className={s.textarea}
                  onChange={handleInputChange}
                  placeholder="Nhập địa chỉ của bạn"
                ></textarea>
              </div>

              <div className={s.formActions}>
                <button
                  type="submit"
                  disabled={loading}
                  className={s.saveButton}
                >
                  <HiCheck size={20} />{" "}
                  {loading ? "Đang lưu..." : "Lưu thay đổi"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setImagePreview(null);
                    setImageFile(null);
                    setRemoveProfilePic(false);
                  }}
                  className={s.cancelButton}
                >
                  <HiX size={20} /> Hủy{" "}
                </button>
              </div>
            </form>
          ) : (
            <div className={s.infoSection}>
              <div className={s.infoItem}>
                <div className={s.infoIcon}>
                  <HiOutlineMail size={24} />
                </div>
                <div>
                  <div className={s.infoLabel}>Email</div>
                  <div className={s.infoValue}>{user?.email}</div>
                </div>
              </div>

              <div className={s.infoItem}>
                <div className={s.infoIcon}>
                  <HiOutlinePhone size={24} />
                </div>
                <div>
                  <div className={s.infoLabel}>Số điện thoại</div>
                  <div className={s.infoValue}>
                    {user?.phone || "Không cung cấp"}
                  </div>
                </div>
              </div>

              <div className={s.infoItem}>
                <div className={s.infoIcon}>
                  <HiOutlineLocationMarker size={24} />
                </div>
                <div>
                  <div className={s.infoLabel}>Địa chỉ</div>
                  <div className={s.infoValue}>
                    {user?.address || "Không cung cấp"}
                  </div>
                </div>
              </div>

              <div className={s.editButtonWrapper}>
                <button
                  onClick={() => setIsEditing(true)}
                  className={s.editProfileButton}
                >
                  Chỉnh sửa thông tin
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
