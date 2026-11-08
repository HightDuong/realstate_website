import React, { useState } from "react";
import { navbarStyles as s } from "../../assets/dummyStyles.js";
import Logo from "./Logo";
import NotificationBell from "./NotificationBell";
import { useAuth } from "../../context/AuthContext.jsx";
import { Link } from "react-router-dom";
import { HiMenuAlt3, HiX } from "react-icons/hi";
const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();

  // to toggle mobile menu
  const toggleMenu = () => setIsOpen(!isOpen);

  // nav_links
  const navLinks = (
    <>
      {user && user.role === "buyer" && (
        <Link to="/" className={s.navLink} onClick={() => setIsOpen(false)}>
          Trang chủ
        </Link>
      )}

      {(!user || user.role === "buyer") && (
        <Link
          to="/properties"
          className={s.navLink}
          onClick={() => setIsOpen(false)}
        >
          Tìm kiếm bất động sản
        </Link>
      )}

      {user && user.role === "buyer" && (
        <>
          <Link
            to="/wishlist"
            className={s.navLink}
            onClick={() => setIsOpen(false)}
          >
            Yêu thích
          </Link>
          <Link
            to="/chat-messages"
            className={s.navLink}
            onClick={() => setIsOpen(false)}
          >
            Tin nhắn
          </Link>
          <Link
            to="/contact"
            className={s.navLink}
            onClick={() => setIsOpen(false)}
          >
            Liên hệ
          </Link>
        </>
      )}
      {!user && (
        <>
          <Link
            to="/login"
            className={s.navLink}
            onClick={() => setIsOpen(false)}
          >
            Đăng nhập
          </Link>

          <Link
            to="/register"
            className={s.navLink}
            onClick={() => setIsOpen(false)}
          >
            Đăng ký
          </Link>
        </>
      )}
      {/*for seller*/}
      {user && user.role === "seller" && (
        <>
          <Link
            to="/dashboard"
            className={s.navLink}
            onClick={() => setIsOpen(false)}
          >
            Bảng điều khiển
          </Link>
        </>
      )}

      {/*for admin */}
      {user && user.role === "admin" && (
        <>
          <Link
            to="/admin-dashboard"
            className={s.navLink}
            onClick={() => setIsOpen(false)}
          >
            Trang quản trị
          </Link>
        </>
      )}
    </>
  );
  return (
    <>
      <nav className={s.nav}>
        <div className={s.container}>
          <div className={s.grid}>
            <div className="justify-self-start">
              <Logo />
            </div>
            <div className={s.desktopMenu}>{navLinks}</div>
            {/*right side*/}
            <div className={s.rightSection}>
              {user ? (
                <div className={s.userSection}>
                  <NotificationBell />
                  <Link to="/profile" className="flex items-center">
                    <img
                      src={
                        user.profilePic ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || "")}&background=0d6e59&color=fff`
                      }
                      alt="Ảnh đại diện"
                      className={s.avatar}
                    />
                  </Link>
                  <button onClick={logout} className={s.logoutButton}>
                    Đăng xuất
                  </button>
                </div>
              ) : null}

              {/* mobile toggle */}

              <div className={s.mobileToggle} onClick={toggleMenu}>
                {isOpen ? <HiX size={28} /> : <HiMenuAlt3 size={28} />}
              </div>
            </div>
          </div>
        </div>
      </nav>
      <div
        className={s.backdrop(isOpen)}
        onClick={() => setIsOpen(false)}
      ></div>
      <div className={s.drawer(isOpen)}>
        <div className={s.drawerHeader}>
          <Logo onClick={() => setIsOpen(false)} />
          <HiX
            size={28}
            onClick={() => setIsOpen(false)}
            className={s.drawerCloseIcon}
          />
        </div>
        <div className={s.drawerNavLinks}>{navLinks}</div>

        {user && (
          <div className={s.drawerUserSection}>
            <div className={s.drawerUserInfo}>
              <img
                src={
                  user.profilePic ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || "")}&background=0d6e59&color=fff`
                }
                alt="Ảnh đại diện"
                className={s.drawerAvatar}
              />

              <div>
                <div className={s.drawerUserName}>{user.name}</div>
                <div className={s.drawerUserEmail}>{user.email}</div>
              </div>
            </div>
            <button onClick={logout} className={s.drawerLogoutButton}>
              Đăng xuất
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Navbar;
