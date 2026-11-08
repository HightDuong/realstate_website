import React, { useEffect, useState } from "react";
import { Routes, Route, useLocation, Outlet, Navigate } from "react-router-dom";
import LandingPage from "./pages/shared/LandingPage";
import Properties from "./pages/shared/Properties";
import PropertyDetails from "./pages/shared/PropertyDetails";
import Register from "./pages/auth/Register";
import VerifyEmail from "./pages/auth/VerifyEmail";
import Login from "./pages/auth/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import Profile from "./pages/shared/Profile";
import AdminLayout from "./components/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import SellerRequests from "./pages/admin/SellerRequests";
import AdminProperties from "./pages/admin/AdminProperties";
import AdminInquiries from "./pages/admin/AdminInquiries";
import AdminContacts from "./pages/admin/AdminContacts";
import SellerLayout from "./components/SellerLayout";
import SellerDashboard from "./pages/seller/SellerDashboard";
import AddProperty from "./pages/seller/AddProperty";
import MyProperties from "./pages/seller/MyProperties";
import EditProperty from "./pages/seller/EditProperty";
import {
  ProtectedRoute,
  PublicRoute,
} from "./components/common/ProtectedRoute";
import { FaChevronUp } from "react-icons/fa";
import { useAuth } from "./context/AuthContext";
import MyInquires from "./pages/buyer/MyInquiries";
import ChatMessages from "./pages/shared/ChatMessages";
import Contact from "./pages/shared/Contact";
import Wishlist from "./pages/buyer/Wishlist";
import AiChatWidget from "./components/ai/AiChatWidget";
import { shouldShowAiChat } from "./components/ai/aiChatConfig";

//to scroll to top whenever the route is change
const ScrollToTopOnRouteChange = () => {
  const { pathname } = useLocation();

  (useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }),
    [pathname]);
  return null;
};

//floating scroll to top btn
const ScrollTopButton = () => {
  const [visible, setVisible] = useState(false);
  const { pathname } = useLocation();
  // trang có nút trợ lý AI ở góc phải dưới → đẩy nút này lên trên
  const bottomClass = shouldShowAiChat(pathname) ? "bottom-24" : "bottom-6";

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      onClick={handleClick}
      className={`fixed ${bottomClass}
        right-6 z-50 flex h-12 w-16 items-center justify-center rounded-full shadow-lg transition-all
        duration-300 ${
          visible
            ? "scale-100 opacity-100 bg-emerald-500 text-white hover:bg-green-400"
            : "pointer-events-none scale-0 opacity-0"
        }`}
    >
      <FaChevronUp size={22} />
    </button>
  );
};

// Layout wrapper tự động dành cho seller và buyer
const SellerLayoutWrapper = () => {
  const { user } = useAuth();
  return user?.role === "seller" ? <SellerLayout /> : <Outlet />;
};

const App = () => {
  useEffect(() => {
    // "clip" thay vì "hidden": "hidden" biến body thành vùng cuộn riêng và làm hỏng position: sticky
    document.body.style.overflowX = "clip";
    document.documentElement.style.overflowX = "clip";

    return () => {
      document.body.style.overflowX = "";
      document.documentElement.style.overflowX = "";
    }; //ngăn chặn tình trạng tràn khung theo chiều ngang trên toàn bộ ứng dụng
  }, []);
  return (
    <div className="min-h-screen w-full overflow-x-clip">
      <ScrollToTopOnRouteChange />
      <ScrollTopButton />
      <AiChatWidget />
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        <Route path="/" element={<LandingPage />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/property/:id" element={<PropertyDetails />} />

        <Route
          element={
            <ProtectedRoute allowedRoles={["buyer", "seller", "admin"]} />
          }
        >
          <Route element={<SellerLayoutWrapper />}>
            <Route path="/profile" element={<Profile />} />
            <Route path="/chat-messages" element={<ChatMessages />} />
            <Route path="/wishlist" element={<Wishlist />} />

            <Route path="/contact" element={<Contact />} />

            <Route path="/inquiries" element={<MyInquires />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["seller"]} />}>
            <Route element={<SellerLayout />}>
              <Route path="/dashboard" element={<SellerDashboard />} />
              <Route path="/seller-dashboard" element={<SellerDashboard />} />

              <Route path="/add-property" element={<AddProperty />} />
              <Route path="/my-properties" element={<MyProperties />} />
              <Route path="/edit-property/:id" element={<EditProperty />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin-dashboard" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route
                path="/admin/seller-requests"
                element={<SellerRequests />}
              />
              <Route path="/admin/properties" element={<AdminProperties />} />
              <Route path="/admin/inquiries" element={<AdminInquiries />} />
              <Route path="/admin/contacts" element={<AdminContacts />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

export default App;
