import Property from "../models/property.model.js";
import Inquiry, { CLOSED_STATUSES } from "../models/inquiry.model.js";
import PropertyView from "../models/propertyView.model.js";
import {
  PUBLIC_VISIBILITY,
  buildPropertyQuery,
  buildPropertySort,
  isPubliclyVisible,
} from "../utils/propertyQuery.js";
import { notifyAdmins } from "../utils/notify.js";
import { scheduleEmbedProperty } from "../ai/embeddings.js";
import { scheduleModerationReview } from "../utils/moderationReview.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";
import {
  deletePropertyCascade,
  destroyImages,
} from "../utils/propertyCleanup.js";
import {
  PROPERTY_STATUSES,
  parseAmenities,
  validatePropertyInput,
} from "../utils/validate.js";
import jwt from "jsonwebtoken";

const optionalNumber = (value) =>
  value === undefined || value === null || value === "" ? undefined : Number(value);
const optionalString = (value) =>
  value === undefined || value === null || String(value).trim() === ""
    ? undefined
    : String(value).trim();

//Add a property
export const addProperty = async (req, res) => {
  try {
    const validationError = validatePropertyInput(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "properties");
        imageUrls.push(result.secure_url);
      }
    }
    let property;
    try {
      property = await Property.create({
        title: req.body.title.trim(),
        description: req.body.description.trim(),
        price: Number(req.body.price),
        city: req.body.city.trim(),
        area: req.body.area.trim(),
        pincode: String(req.body.pincode).trim(),
        propertyType: req.body.propertyType,
        bhk: optionalString(req.body.bhk),
        bathrooms: optionalNumber(req.body.bathrooms),
        areaSize: optionalNumber(req.body.areaSize),
        furnishing: optionalString(req.body.furnishing),
        status: optionalString(req.body.status),
        images: imageUrls,
        seller: req.user._id, //as seller can only create a property
        amenities: parseAmenities(req.body.amenities),
        // tin mới phải được admin duyệt mới hiển thị công khai
        moderationStatus: "pending",
        isVerified: false,
      });
    } catch (error) {
      // Lưu thất bại thì xóa ảnh vừa tải lên để không bị kẹt trên Cloudinary
      await destroyImages(imageUrls);
      throw error;
    }
    res.status(201).json({
      message: "Đăng tin thành công! Tin sẽ hiển thị sau khi quản trị viên duyệt.",
      property,
    });
    notifyAdmins({
      type: "property_submitted",
      title: "Có tin đăng mới chờ duyệt",
      message: `"${property.title}" của ${req.user.name}`,
      link: "/admin/properties",
    });
    // AI hỗ trợ kiểm duyệt (chạy nền, đã gồm tạo embedding cho tìm kiếm ngữ nghĩa).
    // Lỗi không ảnh hưởng việc đăng tin.
    scheduleModerationReview(property._id);
  } catch (error) {
    console.error("ADD_PROPERTY_ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ trong khi đang thêm bất động sản",
    });
  }
};

//to get my properties
export const getMyProperties = async (req, res) => {
  try {
    const properties = await Property.find({
      seller: req.user._id,
    });
    res.status(200).json({
      message: "Lấy danh sách bất động sản thành công",
      properties,
    });
  } catch (error) {
    console.error("GET_MY_PROPERTIES_ERROR:", error);
    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Lỗi máy chủ nội bộ trong khi đang lấy danh sách bất động sản",
    });
  }
};

//update a property
export const updateProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Bất động sản không tồn tại",
      });
    }

    if (property.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền sửa bất động sản này",
      });
    } //ie if seller id doesnt matches then this error comes

    const validationError = validatePropertyInput(req.body, { partial: true });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    // Nội dung dễ bị lạm dụng (tiêu đề, mô tả, ảnh) thay đổi → phải duyệt lại
    const oldTitle = property.title;
    const oldDescription = property.description;
    const oldImages = [...property.images];

    const textFields = ["title", "description", "city", "area", "pincode", "propertyType"];
    textFields.forEach((field) => {
      if (req.body[field] !== undefined) property[field] = String(req.body[field]).trim();
    });
    if (req.body.price !== undefined) property.price = Number(req.body.price);
    if (req.body.bhk !== undefined) property.bhk = optionalString(req.body.bhk);
    if (req.body.bathrooms !== undefined) property.bathrooms = optionalNumber(req.body.bathrooms);
    if (req.body.areaSize !== undefined) property.areaSize = optionalNumber(req.body.areaSize);
    if (req.body.furnishing !== undefined) property.furnishing = optionalString(req.body.furnishing);
    if (req.body.status !== undefined) property.status = optionalString(req.body.status) || property.status;
    if (req.body.amenities !== undefined) property.amenities = parseAmenities(req.body.amenities);

    //for img handling: existingImages là danh sách ảnh cũ được giữ lại.
    //Chỉ chấp nhận ảnh vốn thuộc tin này (không cho chèn URL lạ); ảnh bị bỏ thì xóa trên Cloudinary.
    let removedImages = [];
    if (req.body.existingImages !== undefined) {
      let existing;
      try {
        existing = JSON.parse(req.body.existingImages);
      } catch {
        return res.status(400).json({ success: false, message: "Danh sách ảnh không hợp lệ" });
      }
      if (!Array.isArray(existing)) {
        return res.status(400).json({ success: false, message: "Danh sách ảnh không hợp lệ" });
      }
      const kept = property.images.filter((url) => existing.includes(url));
      removedImages = property.images.filter((url) => !kept.includes(url));
      property.images = kept;
    }

    //upload new img if exists the old one
    if (req.files && req.files.length > 0) {
      if (property.images.length + req.files.length > 10) {
        return res.status(400).json({ success: false, message: "Mỗi tin đăng tối đa 10 ảnh" });
      }
      let newImages = [];
      for (let file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "properties");
        newImages.push(result.secure_url);
      }
      property.images = [...property.images, ...newImages];
    }

    const contentChanged =
      property.title !== oldTitle ||
      property.description !== oldDescription ||
      property.images.join("|") !== oldImages.join("|");
    // Tin bị từ chối: sửa bất kỳ → gửi duyệt lại. Tin đã duyệt: chỉ khi đổi tiêu đề/mô tả/ảnh.
    const needsReview =
      property.moderationStatus === "rejected" ||
      (property.moderationStatus === "approved" && contentChanged);
    if (needsReview) {
      property.moderationStatus = "pending";
      property.isVerified = false;
      property.rejectionReason = undefined;
    }

    await property.save();
    await destroyImages(removedImages);

    res.json({
      success: true,
      message: needsReview
        ? "Cập nhật thành công! Tin đã được gửi duyệt lại."
        : "Cập nhật bất động sản thành công",
      property, //update data
    });
    if (needsReview) {
      notifyAdmins({
        type: "property_submitted",
        title: "Có tin đăng cần duyệt lại",
        message: `"${property.title}" của ${req.user.name} vừa được chỉnh sửa`,
        link: "/admin/properties",
      });
    }
    // Tin đang chờ duyệt (vừa gửi lại hoặc sửa khi đang chờ) → AI phân tích lại, đã gồm embedding.
    // Nội dung không đổi thì bỏ qua nhờ contentHash. Tin không cần duyệt → chỉ tính lại embedding.
    if (property.moderationStatus === "pending") scheduleModerationReview(property._id);
    else scheduleEmbedProperty(property._id);
  } catch (error) {
    console.error("UPDATE_PROPERTY_ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ trong khi đang cập nhật bất động sản",
    });
  }
};

//to delete a property

export const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Bất động sản không tồn tại",
      });
    }
    //check the ownership
    if (property.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa bất động sản này",
      });
    }
    //xóa tin + ảnh Cloudinary + wishlist, yêu cầu tư vấn, lượt xem liên quan
    await deletePropertyCascade(property);
    res.status(200).json({
      success: true,
      message: "Bất động sản đã được xóa thành công",
    });
  } catch (error) {
    console.error("DELETE_PROPERTY_ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ trong khi đang xóa bất động sản",
    });
  }
};

//update property status
export const updatePropertyStatus = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Bất động sản không tồn tại",
      });
    }
    //check the ownership
    if (property.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật bất động sản này",
      });
    }
    if (!PROPERTY_STATUSES.includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
      });
    }
    property.status = req.body.status;
    await property.save();
    res.status(200).json({
      success: true,
      message: "Trạng thái bất động sản đã được cập nhật thành công",
      property,
    });
  } catch (error) {
    console.error("UPDATE_PROPERTY_STATUS_ERROR:", error);
    res.status(500).json({
      success: false,
      message:
        "Lỗi máy chủ nội bộ trong khi đang cập nhật trạng thái bất động sản",
    });
  }
};

//to get all properties
export const getAllProperties = async (req, res) => {
  try {
    const { sort, page, limit } = req.query;

    const query = buildPropertyQuery(req.query);
    const sortOption = buildPropertySort(sort);

    let findQuery = Property.find(query)
      .populate("seller", "name phone profilePic")
      .sort(sortOption);

    // phân trang: chỉ áp dụng khi client gửi limit, không gửi thì trả về toàn bộ như cũ
    const pageSize = Math.min(Math.max(parseInt(limit) || 0, 0), 50);
    const currentPage = Math.max(parseInt(page) || 1, 1);
    if (pageSize > 0) {
      findQuery = findQuery.skip((currentPage - 1) * pageSize).limit(pageSize);
    }

    const [properties, total] = await Promise.all([
      findQuery,
      Property.countDocuments(query),
    ]);

    res.json({
      success: true,
      count: properties.length, //for number of properties
      total,
      page: currentPage,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 1,
      hasMore: pageSize > 0 && currentPage * pageSize < total,
      properties,
    });
  } catch (error) {
    console.error("GET_ALL_PROPERTIES_ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách bất động sản",
    });
  }
};

//to get property details
export const getPropertyDetails = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).populate(
      "seller",
      "name phone profilePic",
    );
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Bất động sản không tồn tại",
      });
    }

    //unique view tracking by id
    let visitorId = req.ip;
    let visitorRole = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        visitorId = decoded.id;
        visitorRole = decoded.role;
      } catch {
        //ignore
      }
    }
    const isSellerChecking = visitorId === property.seller._id.toString();

    // Tin chờ duyệt / bị từ chối: chỉ chủ tin và admin xem được
    const visible = isPubliclyVisible(property);
    if (!visible && !isSellerChecking && visitorRole !== "admin") {
      return res.status(404).json({
        success: false,
        message: "Bất động sản không tồn tại",
      });
    }
    //only increment the view if not seller. Cập nhật nguyên tử: chỉ +1 khi visitorId chưa có trong viewedBy
    //(viewedBy có select: false nên không bị tải về / trả cho client)
    if (!isSellerChecking && visible) {
      const result = await Property.updateOne(
        { _id: property._id, viewedBy: { $ne: visitorId } },
        { $inc: { views: 1 }, $push: { viewedBy: visitorId } },
      );
      if (result.modifiedCount > 0) property.views += 1;
    }

    // Lượt xem theo ngày (mỗi visitor 1 lượt / ngày) cho thống kê "hôm nay"
    if (!isSellerChecking && visible) {
      try {
        await PropertyView.updateOne(
          { property: property._id, visitorId, date: getTodayVN() },
          { $setOnInsert: { seller: property.seller._id } },
          { upsert: true },
        );
      } catch (error) {
        // Trùng key khi 2 request cùng lúc → đã được tính, bỏ qua
        if (error.code !== 11000) {
          console.error("TRACK_DAILY_VIEW_ERROR:", error);
        }
      }
    }

    const similarProperties = await Property.find({
      _id: { $ne: property._id },
      city: property.city,
      propertyType: property.propertyType,
      status: "sale",
      ...PUBLIC_VISIBILITY,
    })
      .limit(4)
      .select("title price city area propertyType images");

    res.status(200).json({
      success: true,
      property,
      similarProperties,
    });
  } catch (error) {
    console.error("GET_PROPERTY_DETAILS_ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ trong khi đang lấy chi tiết bất động sản",
    });
  }
};

//seller dashboard
export const getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const [
      totalProperties,
      activeListings,
      soldProperties,
      totalInquiries,
      openInquiries,
      pendingListings,
      rejectedListings,
    ] = await Promise.all([
      Property.countDocuments({ seller: sellerId }),
      // "Đang hoạt động" = đang bán và người mua nhìn thấy (không tính tin chờ duyệt / bị từ chối)
      Property.countDocuments({ seller: sellerId, status: "sale", ...PUBLIC_VISIBILITY }),
      Property.countDocuments({ seller: sellerId, status: "sold" }),
      Inquiry.countDocuments({ seller: sellerId }),
      // Khách đang chăm sóc: chưa chốt / chưa dừng ($nin khớp cả bản ghi cũ chưa có status = "mới")
      Inquiry.countDocuments({ seller: sellerId, status: { $nin: CLOSED_STATUSES } }),
      Property.countDocuments({ seller: sellerId, moderationStatus: "pending" }),
      Property.countDocuments({ seller: sellerId, moderationStatus: "rejected" }),
    ]);

    //calculate total views for all properties
    const viewsData = await Property.aggregate([
      { $match: { seller: sellerId } },
      { $group: { _id: null, totalViews: { $sum: "$views" } } },
    ]);
    const totalViews = viewsData.length > 0 ? viewsData[0].totalViews : 0;

    res.status(200).json({
      success: true,
      stats: {
        totalProperties,
        activeListings,
        soldProperties,
        totalInquiries,
        openInquiries,
        totalViews,
        pendingListings,
        rejectedListings,
      },
    });
  } catch (error) {
    console.error("GET_SELLER_DASHBOARD_ERROR:", error);
    res.status(500).json({
      success: false,
      message:
        "Lỗi máy chủ nội bộ trong khi đang lấy bảng điều khiển người bán",
    });
  }
};

// Ngày hiện tại theo giờ Việt Nam, dạng "YYYY-MM-DD"
const getTodayVN = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );

//BĐS của seller được xem nhiều nhất trong hôm nay
export const getSellerTrendingToday = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 20);

    const [totals, top] = await Promise.all([
      PropertyView.aggregate([
        { $match: { seller: req.user._id, date: getTodayVN() } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: 1 },
            properties: { $addToSet: "$property" },
          },
        },
      ]),
      PropertyView.aggregate([
        { $match: { seller: req.user._id, date: getTodayVN() } },
        { $group: { _id: "$property", todayViews: { $sum: 1 } } },
        { $sort: { todayViews: -1, _id: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: "properties",
            localField: "_id",
            foreignField: "_id",
            as: "property",
          },
        },
        { $unwind: "$property" },
        {
          $project: {
            _id: 0,
            todayViews: 1,
            property: {
              _id: "$property._id",
              title: "$property.title",
              price: "$property.price",
              city: "$property.city",
              area: "$property.area",
              status: "$property.status",
              views: "$property.views",
              image: { $arrayElemAt: ["$property.images", 0] },
            },
          },
        },
      ]),
    ]);

    res.status(200).json({
      success: true,
      date: getTodayVN(),
      totalViewsToday: totals[0]?.totalViews || 0,
      viewedPropertiesToday: totals[0]?.properties.length || 0,
      properties: top,
    });
  } catch (error) {
    console.error("GET_SELLER_TRENDING_TODAY_ERROR:", error);
    res.status(500).json({
      message: "Lỗi máy chủ khi lấy thống kê lượt xem hôm nay",
    });
  }
};

//get property counts by type
export const getPropertyCounts = async (req, res) => {
  try {
    const counts = await Property.aggregate([
      { $match: { status: "sale", ...PUBLIC_VISIBILITY } },
      { $group: { _id: "$propertyType", count: { $sum: 1 } } },
    ]);

    const formattedCounts = counts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});
    res.status(200).json({
      success: true,
      counts: formattedCounts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "Lỗi máy chủ nội bộ trong khi đang lấy số lượng bất động sản theo loại",
    });
  }
};
