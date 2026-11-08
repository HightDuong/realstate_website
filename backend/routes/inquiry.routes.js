import express from 'express'
import { protect, authorize } from '../middlewares/auth.middleware.js'
import {
    sendInquiry,
    getSellerInquiries,
    getBuyerInquiries,
    markAsRead,
    getInquiryDetail,
    updateInquiryStatus,
    updateInquiryNote,
    getSellerInquiryStats,
} from '../controllers/inquiry.controller.js'
import { validateIdParams } from '../utils/validate.js'

const inquiryRouter = express.Router()
const validId = validateIdParams("id")

inquiryRouter.post('/',protect,authorize("buyer") , sendInquiry);
inquiryRouter.get('/my', protect, authorize("buyer"), getBuyerInquiries);
inquiryRouter.get('/seller', protect, authorize("seller"), getSellerInquiries);
inquiryRouter.get('/seller/stats', protect, authorize("seller"), getSellerInquiryStats);
inquiryRouter.get('/:id', validId, protect, authorize("seller"), getInquiryDetail);
inquiryRouter.patch('/:id/read', validId, protect, authorize("seller"), markAsRead);
inquiryRouter.patch('/:id/status', validId, protect, authorize("seller"), updateInquiryStatus);
inquiryRouter.patch('/:id/note', validId, protect, authorize("seller"), updateInquiryNote);

export default inquiryRouter;
