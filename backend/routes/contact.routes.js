import express from 'express'
import { protect ,authorize} from '../middlewares/auth.middleware.js';
import { createContact, getAllContacts, updateContactStatus } from '../controllers/contact.controller.js';
import { rateLimit } from '../utils/rateLimit.js';
import { validateIdParams } from '../utils/validate.js';

const contactRouter = express.Router();

// form công khai → chặn spam: tối đa 5 lần / 15 phút / IP
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Bạn gửi liên hệ quá nhiều lần. Vui lòng thử lại sau ít phút.",
});

contactRouter.post('/', contactLimiter, createContact);
contactRouter.get('/',protect,authorize('admin'), getAllContacts);
contactRouter.patch('/:id/status', validateIdParams('id'), protect, authorize('admin'), updateContactStatus);

export default contactRouter;
