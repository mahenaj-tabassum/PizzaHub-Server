import { Router } from "express";

import verifyToken from "../middleware/verifyToken.js";
import checkBlocked from "../middleware/checkBlocked.js";
import validate from "../middleware/validate.js";

import { updateProfileSchema } from "../validators/profile.validator.js";

import {
  GetMyProfile,
  UpdateMyProfile,
} from "../controllers/user.controller.js";

const router = Router();

// Both endpoints require a valid token and an unblocked account.
router.use(verifyToken, checkBlocked);

// Get own profile.
router.get("/me", GetMyProfile);

// Update own profile.
router.patch("/me", validate(updateProfileSchema), UpdateMyProfile);

export default router;
