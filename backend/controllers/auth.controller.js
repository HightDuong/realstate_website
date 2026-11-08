import "dotenv/config";

import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import { isEmail, normalizeEmail } from "../utils/validate.js";
//Register
export const register = async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);
    // Không cho tự đăng ký tài khoản admin
    const role = req.body.role === "seller" ? "seller" : "buyer";
    if (!name?.trim() || !isEmail(email) || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ họ tên, email hợp lệ và mật khẩu" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: "Mật khẩu phải có ít nhất 6 ký tự" });
    }
    //Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "Email này đã được đăng ký" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      isApproved: role === "seller" ? false : true, // Sellers need approval
      verificationToken,
    });
    try {
      // Simulate sending verification email
      await sendEmail({
        email,
        subject: "Verify your email",
        message:
          "<p>Your email verification code is <strong>" +
          verificationToken +
          "</strong></p><p>Please enter this code in the app to verify your email address.</p>",
      });
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
    }

    res.status(201).json({
      message:
        "Người dùng đã đăng ký . Hãy kiểm tra email của bạn để xác minh địa chỉ email",
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("AUTH_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại sau" });
  }
};

//login
export const login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Yêu cầu nhập email và mật khẩu" });
    }
    const user = await User.findOne({ email });
    // Cùng một thông báo cho "sai email" và "sai mật khẩu" để không lộ email nào đã đăng ký
    const isMatch = user ? await bcrypt.compare(String(password), user.password) : false;
    if (!user || !isMatch) {
      return res.status(400).json({ message: "Email hoặc mật khẩu không đúng" });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Vui lòng xác minh email của bạn trước khi đăng nhập",
      });
    }
    if (user.isBlocked) {
      return res.status(403).json({
        code: "ACCOUNT_BLOCKED",
        message:
          "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.",
      });
    }

    //token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );
    res.json({
      message: "Đăng nhập thành công",
      token,
      user,
    });
  } catch (error) {
    console.error("AUTH_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại sau" });
  }
};

//get profile
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }
    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("AUTH_ERROR:", error);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại sau" });
  }
};

//verify email
export const verifyEmail = async (req, res) => {
  try {
    let { code } = req.body;
    const email = normalizeEmail(req.body.email);
    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Yêu cầu nhập email và mã xác minh" });
    }
    code = String(code).trim();
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Người dùng không tồn tại" });
    }
    if (user.isVerified) {
      return res.status(400).json({ message: "Email đã được xác minh" });
    }
    if (String(user.verificationToken).trim() !== code) {
      return res.status(400).json({ message: "Mã xác minh không đúng" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();
    res.json({
      message: "Xác minh email thành công",
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: "Lỗi máy chủ, vui lòng thử lại sau",
      success: false,
    });
  }
};

//forgot password
// Forgot Password
export const forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ message: "Vui lòng nhập email" });
    }
    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài khoản với email này" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 mins

    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.resetPasswordExpires = resetPasswordExpire;
    await user.save();

    // Clean URL - remove trailing slash
    const clientUrl = (
      process.env.FRONTEND_URL || "http://localhost:5173"
    ).replace(/\/+$/, "");
    const resetUrl = `${clientUrl}/reset-password/${resetToken}`;


    const message = `
            <h2>Password Reset Request</h2>
            <p>You requested a password reset. Please click on the link below to reset your password:</p>
            <a href="${resetUrl}" clicktracking="off">${resetUrl}</a>
            <p>This link will expire in 15 minutes.</p>
        `;

    try {
      await sendEmail({
        email: user.email,
        subject: "Password Reset - Real Estate Platform",
        message,
      });
      res
        .status(200)
        .json({ message: "Đã gửi email đặt lại mật khẩu", success: true });
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      return res
        .status(500)
        .json({ message: "Không gửi được email, vui lòng thử lại sau", success: false });
    }
  } catch (err) {
    console.error("AUTH_ERROR:", err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại sau", success: false });
  }
}; //for rest password we require the email

//now to rest password
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: "Mật khẩu phải có ít nhất 6 ký tự", success: false });
    }

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).json({
        message: "Mã khôi phục mật khẩu không hợp lệ hoặc đã hết hạn",
        success: false,
      });
    }
    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res
      .status(200)
      .json({ message: "Mật khẩu đã được đặt lại thành công", success: true });
  } catch (err) {
    console.error("AUTH_ERROR:", err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại sau", success: false });
  }
};
