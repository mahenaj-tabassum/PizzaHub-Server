import { Router } from "express";

import verifyToken from "../middleware/verifyToken.js";
import checkBlocked from "../middleware/checkBlocked.js";
import requireRole from "../middleware/requireRole.js";
import upload from "../middleware/upload.js";

import { ROLES } from "../utils/constants.js";
import { UploadImage } from "../controllers/upload.controller.js";

const router = Router();

router.post(
  "/",
  verifyToken,
  checkBlocked,
  requireRole(ROLES.VENDOR),
  upload.single("image"),
  UploadImage,
);

export default router;
