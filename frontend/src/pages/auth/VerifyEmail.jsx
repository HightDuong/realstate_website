import React, { isValidElement, useState } from "react";
import { verifyEmailStyles as s } from "../../assets/dummyStyles";
import Navbar from "../../components/common/Navbar";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import API_URL from "../../config";
const VerifyEmail = () => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  //to get email passed from register page
  const emailFromState = location.state?.email || "";
  const [email, setEmail] = useState(emailFromState);

  // to submit code
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await axios.post(`${API_URL}api/auth/verify-email`, {
        email,
        code,
      });

      console.log(res.data);
      if (res.data.success) {
        setSuccess(
          "Xác minh thành công! Bạn sẽ được chuyển hướng đến trang đăng nhập.",
        );
        setTimeout(() => navigate("/login"), 2000);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Đã có lỗi xảy ra. Vui lòng thử lại.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={s.pageContainer}>
      <Navbar />
      <div className={s.containerCenter}>
        <div className={s.card}>
          <h2 className={s.title}>Xác minh email của bạn</h2>
          <p className={s.subtitle}>Nhập đoạn code gồm 6 số từ email</p>

          {error && <div className={s.error}>{error}</div>}
          {success && <div className={s.success}>{success}</div>}
          <form onSubmit={handleSubmit} className={s.form}>
            {!emailFromState && (
              <div>
                <label className={s.label}>Email:</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={s.input}
                  placeholder="Nhập email đã đăng ký"
                />
              </div>
            )}
            <div>
              <label className={s.label}>Mã xác minh</label>
              <input
                type="text"
                maxLength="6"
                placeholder="123123"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className={s.codeInput}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={s.submitButton}
            >
              {isLoading ? "Đang xác minh..." : "Xác minh Email"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
