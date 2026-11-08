import mongoose from "mongoose";
const userSchema = new mongoose.Schema({    
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['buyer', 'seller','admin'], default: 'buyer' },
    phone: { type: String },
    isBlocked: { type: Boolean, default: false },
    profilePic: { type: String },
    address: { type: String },
    isApproved: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
},{ timestamps: true });

// Không bao giờ gửi các trường nhạy cảm về client: áp dụng cho mọi res.json(user),
// kể cả user được populate trong document khác. Code server vẫn đọc được các trường này.
const SENSITIVE_FIELDS = ["password", "verificationToken", "resetPasswordToken", "resetPasswordExpires"];
const hideSensitive = (doc, ret) => {
  SENSITIVE_FIELDS.forEach((field) => delete ret[field]);
  return ret;
};
userSchema.set("toJSON", { transform: hideSensitive });
userSchema.set("toObject", { transform: hideSensitive });

const User = mongoose.model("User", userSchema);

export default User;