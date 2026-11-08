import React, { useState } from "react";
import { loginStyles as s } from "../../assets/dummyStyles";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../components/common/Navbar";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { HiEye, HiEyeOff } from "react-icons/hi";
const Login = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  //to handleChange for input value

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError("");
  };
  //to submit the data to login
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await login(formData.email, formData.password);

    if (result.success) {
      const storeUser = JSON.parse(
        localStorage.getItem("user") || sessionStorage.getItem("user"),
      );
      if (storeUser?.role === "admin") {
        navigate("/admin-dashboard");
      } else if (storeUser?.role === "seller") {
        navigate("/dashboard");
      } else {
        navigate("/");
      }
    } else {
      setError(result.message || "Đăng nhập thất bại. Vui lòng thử lại.");
    }
    setIsLoading(false);
  };
  return (
    <div className={s.pageContainer}>
      <Navbar />
      <div className={s.containerCenter}>
        <div className={s.card}>
          <h2 className={s.title}>Chào mừng bạn</h2>
          <p className={s.subtitle}>Đăng nhập để tiếp tục sử dụng RealEstate</p>

          {error && <div className={s.error}>{error}</div>}
          <form onSubmit={handleSubmit} className={s.form}>
            <div>
              <label className={s.label}>Email</label>
              <input
                type="email"
                name="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={handleChange}
                required
                className={s.input}
              />
            </div>
            <div>
              <div className={s.passwordHeader}>
                <label className={s.label}>Mật khẩu</label>
                <Link to="/forgot-password" className={s.forgotLink}>
                  Quên mật khẩu
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="******"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className={s.input}
                  style={{ paddingRight: "40px" }}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    padding: 0,
                  }}
                >
                  {showPassword ? <HiEyeOff size={20} /> : <HiEye size={20} />}
                </button>
              </div>
            </div>
            <button
              className={s.submitButton}
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>
          <p className={s.footerText}>
            Bạn chưa có tài khoản?{" "}
            <Link to="/register" className={s.registerLink}>
              Tạo tài khoản
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
