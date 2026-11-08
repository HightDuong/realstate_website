import React, { useState } from "react";
import { contactStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import API_URL from "../../config";
import Navbar from "../../components/common/Navbar";
import {
  HiOutlineAnnotation,
  HiOutlineCheckCircle,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineUser,
} from "react-icons/hi";
import axios from "axios";

const Contact = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    message: "",
    role: user?.role === "seller" ? "seller" : "buyer",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  //to submit the data to server side
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${API_URL}api/contact`, formData);
      if (res.data.success) {
        setSuccess(true);
        setFormData({ ...formData, message: "" });
      }
    } catch (error) {
      setError(error.response?.data?.message || "Gửi tin nhắn thất bại!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.container}>
      {user?.role !== "seller" && <Navbar />}

      <div className={s.mainContainer}>
        <div className={s.header}>
          <h1 className={s.heading}>Liên hệ với chúng tôi</h1>
          <p className={s.subheading}>
            Bạn có câu hỏi hay phản hồi gì không? Chúng tôi rất mong nhận được
            tin từ bạn. Đội ngũ của chúng tôi luôn sẵn sàng hỗ trợ bất cứ điều
            gì bạn cần
          </p>
        </div>

        <div className={s.grid}>
          <div className={s.contactInfoContainer}>
            <div className={s.contactInfoCard}>
              <div className={`${s.contactItem} ${s.contactItemMarginBottom}`}>
                <div className={s.contactIconWrapper}>
                  <HiOutlineMail size={24} />
                </div>

                <div>
                  <div className={s.contactTitle}>Email của chúng tôi</div>
                  <div className={s.contactDetail}>support@realestate.com</div>
                </div>
              </div>

              <div className={s.contactItem}>
                <div className={s.contactIconWrapperAlt}>
                  <HiOutlinePhone size={24} />
                </div>

                <div>
                  <div className={s.contactTitle}>Liên hệ chúng tôi</div>
                  <div className={s.contactDetail}>+84 123456789</div>
                </div>
              </div>
            </div>

            <div className={s.quickSupportCard}>
              <h3 className={s.quickSupportTitle}>Hỗ trợ nhanh</h3>
              <p className={s.quickSupportText}>
                Hỗ trợ 24/7 dành cho khách hàng cao cấp. Sự hài lòng của bạn
                luôn là ưu tiên của chúng tôi.
              </p>
            </div>
          </div>

          {/* contact form */}
          <div className={s.formCard}>
            {success ? (
              <div className={s.successContainer}>
                <HiOutlineCheckCircle size={64} className={s.successIcon} />
                <h2 className={s.successTitle}>Gửi tin nhắn</h2>
                <p className={s.successMessage}>
                  Cảm ơn bạn đã liên hệ với chúng tôi. Đội ngũ hỗ trợ sẽ phản
                  hồi bạn sớm nhất có thể.
                </p>
                <button
                  onClick={() => setSuccess(false)}
                  className={s.successButton}
                >
                  Gửi bất kỳ tin nhắn nào
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={s.form}>
                <div className={s.formTwoColGrid}>
                  <div className={s.inputGroup}>
                    <label className={s.label}>
                      <HiOutlineUser size={16} className="mr-1" />
                      Tên
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Điền tên..."
                      className={s.input}
                    />
                  </div>

                  <div className={s.inputGroup}>
                    <label className={s.label}>
                      <HiOutlineMail size={16} className="mr-1" />
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="Điền email..."
                      className={s.input}
                    />
                  </div>
                </div>

                <div className={s.inputGroup}>
                  <label className={s.label}>
                    <HiOutlinePhone size={16} className="mr-1" />
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Nhập số điện thoại..."
                    className={s.input}
                  />
                </div>

                <div className={s.inputGroup}>
                  <label className={s.label}>
                    <HiOutlineAnnotation size={16} className="mr-1" />
                    Tin nhắn
                  </label>
                  <textarea
                    name="message"
                    required
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Bạn cần hỗ trợ gì ..."
                    rows="5"
                    className={`${s.input} ${s.textarea}`}
                  ></textarea>
                </div>

                {error && <div className={s.errorMessage}>{error}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className={s.submitButton}
                >
                  {loading ? "Đang gửi..." : "Gửi tin nhắn"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
