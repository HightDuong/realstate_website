import User from "../models/user.model.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";
import { destroyImages } from "../utils/propertyCleanup.js";

//Get profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("GET_PROFILE_ERROR:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi lấy hồ sơ" });
  }
};


//to get public profile of user
export const getPublicProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("name profilePic role createdAt");
    if (!user) {
      return res.status(404).json({ success: false, message: "Người dùng không tồn tại" });
    }
    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error("GET_PUBLIC_PROFILE_ERROR:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi lấy hồ sơ" });
  }
};


//update profile
export const updateProfile = async (req, res) => {
  try {
    const { name, phone, address, removeProfilePic } = req.body;
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Họ tên không được để trống" });
    }
    if (name !== undefined && String(name).trim().length > 100) {
      return res.status(400).json({ success: false, message: "Họ tên tối đa 100 ký tự" });
    }
    if (phone && !/^[0-9+\s().-]{8,20}$/.test(String(phone).trim())) {
      return res.status(400).json({ success: false, message: "Số điện thoại không hợp lệ" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Người dùng không tồn tại" });
    }

    //image handling: ảnh cũ bị thay/xóa thì xóa luôn trên Cloudinary
    const oldPic = user.profilePic;
    if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, "profiles");
        user.profilePic = result.secure_url;
    } else if (removeProfilePic === "true") {
        user.profilePic = null;
    }

    if (name !== undefined) user.name = String(name).trim();
    if (phone !== undefined) user.phone = String(phone).trim();
    if (address !== undefined) user.address = String(address).trim();

    const updatedUser = await user.save();
    if (oldPic && oldPic !== updatedUser.profilePic) await destroyImages([oldPic]);

    res.status(200).json({
      success: true,
      message: "Cập nhật hồ sơ thành công",
      user: updatedUser
    });

  } catch (error) {
    console.error("UPDATE_PROFILE_ERROR:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi cập nhật hồ sơ" });
  }
};
