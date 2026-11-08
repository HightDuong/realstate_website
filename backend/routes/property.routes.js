import express from 'express'
import { protect, authorize, requireApproved } from '../middlewares/auth.middleware.js'
import { getAllProperties, addProperty, getMyProperties, updateProperty, deleteProperty, updatePropertyStatus, getPropertyCounts, getPropertyDetails, getSellerDashboard, getSellerTrendingToday } from '../controllers/property.controller.js'
import upload from '../middlewares/upload.middleware.js'
import { validateIdParams } from '../utils/validate.js'


const propertyRouter = express.Router()
const validId = validateIdParams("id");

propertyRouter.get('/', getAllProperties);
propertyRouter.get("/count", getPropertyCounts);
//protect the routes that only seller can do these works
propertyRouter.post('/', protect, authorize("seller"), requireApproved, upload.array('images',10), addProperty);
propertyRouter.get('/my', protect, authorize("seller"), getMyProperties);
propertyRouter.get("/seller/dashboard", protect, authorize("seller"), getSellerDashboard);
propertyRouter.get("/seller/trending-today", protect, authorize("seller"), getSellerTrendingToday);
propertyRouter.put('/:id', validId, protect, authorize("seller"), requireApproved, upload.array('images', 10), updateProperty);

propertyRouter.delete('/:id', validId, protect, authorize("seller"), requireApproved, deleteProperty);
propertyRouter.patch('/:id/status', validId, protect, authorize("seller"), requireApproved, updatePropertyStatus);


propertyRouter.get("/:id", validId, getPropertyDetails);

export default propertyRouter;
