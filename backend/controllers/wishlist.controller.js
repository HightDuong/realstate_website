import Wishlist from "../models/wishlist.model.js";
import Property from "../models/property.model.js";
//to add property to wishlist

export const addWishlist = async (req, res) => {
    try {
        const propertyId = req.params.propertyId;

        const property = await Property.exists({ _id: propertyId });
        if (!property) {
            return res.status(404).json({ message: "Bất động sản không tồn tại" });
        }

        const existing = await Wishlist.findOne({
            user: req.user._id,
            property: propertyId
        });
        if (existing) {
            return res.status(200).json({ message: "Bất động sản đã có trong danh sách yêu thích" });
        }

        await Wishlist.create({
            user: req.user._id,
            property: propertyId
        });
        res.status(201).json({ message: "Bất động sản đã được thêm vào danh sách yêu thích" });
    }
    catch (error) {
        console.error("ADD_WISHLIST_ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi thêm vào danh sách yêu thích" });
    }
}

//to get the property that is in wishlist
export const getWishlist = async (req, res) => {
    try {
        const data = await Wishlist.find({
            user: req.user._id }).populate("property");
        // bỏ các mục trỏ tới tin đã bị xóa (dữ liệu cũ trước khi có xóa dây chuyền)
        res.status(200).json({ success: true, data: data.filter((w) => w.property) });
    }
    catch (error) {
        console.error("GET_WISHLIST_ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi lấy danh sách yêu thích" });
    }
}

//to remove property from wishlist
export const removeWishlist = async (req, res) => {
    try {
        const propertyId = req.params.propertyId;
        const result = await Wishlist.findOneAndDelete({
            user: req.user._id,
            property: propertyId
        });
        if (!result) {
            return res.status(404).json({ message: "Bất động sản không tồn tại trong danh sách yêu thích" });
        }
        res.status(200).json({ message: "Bất động sản đã được xóa khỏi danh sách yêu thích" });
    }
    catch (error) {
        console.error("REMOVE_WISHLIST_ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi xóa khỏi danh sách yêu thích" });
    }
}
