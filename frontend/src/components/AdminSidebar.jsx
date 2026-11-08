import React from "react";
import { adminSidebarStyles as s } from "../assets/dummyStyles";
import { useAuth } from "../context/AuthContext";
import Logo from "./common/Logo";
import {
  HiOutlineChatAlt2,
  HiOutlineLibrary,
  HiOutlineLogout,
  HiOutlineMail,
  HiOutlineUserCircle,
  HiOutlineUsers,
  HiOutlineViewGrid,
} from "react-icons/hi";
import { NavLink } from "react-router-dom";

const AdminSidebar = ({ isOpen, onClose }) => {
  const { logout } = useAuth();
  const navItems = [
    { name: "Tổng quan", icon: HiOutlineViewGrid, path: "/admin-dashboard" },
    { name: "Người dùng", icon: HiOutlineUsers, path: "/admin/users" },
    {
      name: "Yêu cầu làm người bán",
      icon: HiOutlineUserCircle,
      path: "/admin/seller-requests",
    },
    { name: "Bất động sản", icon: HiOutlineLibrary, path: "/admin/properties" },
    { name: "Yêu cầu tư vấn", icon: HiOutlineChatAlt2, path: "/admin/inquiries" },
    { name: "Hộp thư liên hệ", icon: HiOutlineMail, path: "/admin/contacts" },
  ];
  return (
    <>
      {/* Backdrop - chỉ hiển thị khi sidebar mở (mobile) */}
      <div className={s.backdrop(isOpen)} onClick={onClose} />

      {/* Sidebar - riêng biệt khỏi backdrop */}
      <aside className={s.sidebar(isOpen)}>
        <div className={s.logoContainer}>
          <Logo fontSize="1.25rem" iconSize={20} />
        </div>

        <nav className={s.navContainer}>
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => s.navLink(isActive)}
            >
              <item.icon size={20} />
              {item.name}
            </NavLink>
          ))}
        </nav>
        <div className={s.logoutContainer}>
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            className={s.logoutButton}
          >
            <HiOutlineLogout size={20} />
            Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
