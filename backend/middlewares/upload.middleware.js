import multer from 'multer'

const storage = multer.memoryStorage();

const upload = multer({ storage });

export default upload;

// Ảnh gửi cho "AI viết tin": chỉ giữ trong bộ nhớ để gửi cho AI, không tải lên Cloudinary, không lưu.
// Trình duyệt đã thu nhỏ ảnh trước khi gửi nên giới hạn 2MB/ảnh, tối đa 4 ảnh.
const draftImageUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 4, fields: 40 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
}).array("images", 4);

export const draftImages = (req, res, next) =>
  draftImageUpload(req, res, (error) => {
    if (!error) return next();
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Mỗi ảnh gửi cho AI tối đa 2MB"
        : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
          ? "Chỉ gửi tối đa 4 ảnh cho AI"
          : "Dữ liệu gửi lên không hợp lệ";
    res.status(400).json({ message });
  });
