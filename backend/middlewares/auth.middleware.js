import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

//protect
export const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Bạn chưa đăng nhập" });
        }
        const token = authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "Bạn chưa đăng nhập" });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select("-password");
        if (!req.user) {
            return res.status(401).json({ message: "Tài khoản không tồn tại" });
        }
        if (req.user.isBlocked) {
            return res.status(403).json({
                code: "ACCOUNT_BLOCKED",
                message: "Tài khoản của bạn đã bị khóa",
            });
        }
        next();
    } catch (error) {
        res.status(401).json({ message: "Token không hợp lệ" });
    }
};


//optionalAuth: có token hợp lệ thì gán req.user, không có/không hợp lệ thì coi là khách (req.user = null)
//dùng cho các API cả khách lẫn người đăng nhập đều gọi được (vd chatbot AI)
export const optionalAuth = async (req, res, next) => {
    req.user = null;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return next();
    try {
        const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");
        if (user?.isBlocked) {
            return res.status(403).json({
                code: "ACCOUNT_BLOCKED",
                message: "Tài khoản của bạn đã bị khóa",
            });
        }
        req.user = user || null;
    } catch {
        // token hết hạn/sai → tiếp tục như khách
    }
    next();
};

//seller phải được admin duyệt (isApproved) mới được đăng/sửa/xóa tin
//dùng sau protect + authorize("seller")
export const requireApproved = (req, res, next) => {
    if (req.user.role === "seller" && !req.user.isApproved) {
        return res.status(403).json({
            code: "SELLER_NOT_APPROVED",
            message: "Tài khoản người bán của bạn đang chờ quản trị viên phê duyệt",
        });
    }
    next();
};

//role based authentication
export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Bạn không có quyền truy cập" });
        }
        next();
    };
};