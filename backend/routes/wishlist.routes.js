import express from 'express'
import { addWishlist, getWishlist, removeWishlist } from '../controllers/wishlist.controller.js'
import { protect } from '../middlewares/auth.middleware.js'
import { validateIdParams } from '../utils/validate.js'

const wishlistRouter = express.Router();
const validId = validateIdParams("propertyId");

wishlistRouter.post('/:propertyId', validId, protect, addWishlist);
wishlistRouter.get('/', protect, getWishlist);

wishlistRouter.delete('/:propertyId', validId, protect, removeWishlist);

export default wishlistRouter;
