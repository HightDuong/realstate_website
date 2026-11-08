import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notification.controller.js";
import { validateIdParams } from "../utils/validate.js";

const notificationRouter = express.Router();
notificationRouter.use(protect);

notificationRouter.get("/", getNotifications);
notificationRouter.patch("/read-all", markAllNotificationsRead);
notificationRouter.patch("/:id/read", validateIdParams("id"), markNotificationRead);

export default notificationRouter;
