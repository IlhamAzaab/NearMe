import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit for iOS images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, and HEIC allowed."));
    }
  },
});

// Multer error handler middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        message: "File too large. Maximum size is 15MB. Please compress your image or use a smaller file." 
      });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

/**
 * GET /restaurant-onboarding/status
 * Get onboarding status for admin and linked restaurant
 */
router.get("/status", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;

    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("admins")
      .select(
        "id, onboarding_step, onboarding_completed, admin_status, force_password_change, restaurant_id"
      )
      .eq("id", adminId)
      .single();

    if (adminError || !adminData) {
      console.error("Status fetch error:", adminError);
      return res.status(500).json({ message: "Failed to load status" });
    }

    let restaurant = null;

    if (adminData.restaurant_id) {
      const { data: restaurantData, error: restaurantError } =
        await supabaseAdmin
          .from("restaurants")
          .select("id, restaurant_name, restaurant_status")
          .eq("id", adminData.restaurant_id)
          .maybeSingle();

      if (restaurantError) {
        console.error("Restaurant fetch error:", restaurantError);
        return res.status(500).json({ message: "Failed to load restaurant" });
      }

      restaurant = restaurantData;
    }

    return res.json({
      onboarding_step: adminData.onboarding_step,
      onboarding_completed: adminData.onboarding_completed,
      admin_status: adminData.admin_status,
      force_password_change: adminData.force_password_change,
      restaurant,
    });
  } catch (e) {
    console.error("/restaurant-onboarding/status error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /restaurant-onboarding/upload-image
 * Upload a single image to Cloudinary for admin KYC
 */
router.post(
  "/upload-image",
  authenticate,
  upload.single("file"),
  handleMulterError,
  async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { imageType } = req.body;
      const adminId = req.user.id;

      // Upload to Cloudinary
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;

      const result = await cloudinary.uploader.upload(dataURI, {
        folder: `nearme/admin-kyc/${adminId}`,
        public_id: `${imageType}_${Date.now()}`,
        resource_type: "auto",
        overwrite: true,
        access_mode: "public",
      });

      return res.json({
        message: "Image uploaded successfully",
        url: result.secure_url,
        publicId: result.public_id,
      });
    } catch (e) {
      console.error("/upload-image error:", e);
      return res
        .status(500)
        .json({ message: "Server error", error: e.message });
    }
  }
);

/**
 * POST /restaurant-onboarding/step-1
 * Submit admin personal information
 */
router.post("/step-1", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const {
      fullName,
      nicNumber,
      dateOfBirth,
      phone,
      homeAddress,
      profilePhotoUrl,
      nicFrontUrl,
      nicBackUrl,
    } = req.body;

    if (
      !fullName ||
      !nicNumber ||
      !dateOfBirth ||
      !phone ||
      !homeAddress ||
      !profilePhotoUrl ||
      !nicFrontUrl ||
      !nicBackUrl
    ) {
      return res.status(400).json({
        message:
          "All fields are required: fullName, nicNumber, dateOfBirth, phone, homeAddress, profilePhotoUrl, nicFrontUrl, nicBackUrl",
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from("admins")
      .update({
        full_name: fullName,
        nic_number: nicNumber,
        date_of_birth: dateOfBirth,
        phone,
        home_address: homeAddress,
        profile_photo_url: profilePhotoUrl,
        nic_front: nicFrontUrl,
        nic_back: nicBackUrl,
        onboarding_step: 2,
        profile_completed: true,
      })
      .eq("id", adminId);

    if (updateError) {
      console.error("Step 1 update error:", updateError);
      return res
        .status(500)
        .json({ message: "Failed to save personal information" });
    }

    return res.json({
      message: "Personal information saved successfully",
      nextStep: 2,
    });
  } catch (e) {
    console.error("/restaurant-onboarding/step-1 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /restaurant-onboarding/step-2
 * Submit restaurant details
 */
router.post("/step-2", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const {
      restaurantName,
      registrationNumber,
      address,
      city,
      postalCode,
      latitude,
      longitude,
      openingTime,
      closeTime,
      logoUrl,
      coverImageUrl,
    } = req.body;

    if (!restaurantName || !address || !city || !postalCode) {
      return res.status(400).json({
        message: "Required fields: restaurantName, address, city, postalCode",
      });
    }

    if (!openingTime || !closeTime) {
      return res.status(400).json({
        message: "Opening time and closing time are required",
      });
    }

    if (!coverImageUrl) {
      return res.status(400).json({
        message: "Cover image is required",
      });
    }

    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .single();

    if (adminError) {
      console.error("Admin fetch error:", adminError);
      return res.status(500).json({ message: "Failed to load admin" });
    }

    // Ensure BRN is unique if provided
    if (registrationNumber) {
      const { data: existingBusiness, error: businessError } =
        await supabaseAdmin
          .from("restaurants")
          .select("id, admin_id")
          .eq("business_registration_number", registrationNumber)
          .maybeSingle();

      if (businessError) {
        console.error("BRN lookup error:", businessError);
        return res
          .status(500)
          .json({ message: "Failed to validate registration" });
      }

      if (existingBusiness && existingBusiness.admin_id !== adminId) {
        return res.status(409).json({
          message: "Business registration number already exists",
        });
      }
    }

    let restaurantId = adminData?.restaurant_id || null;

    if (!restaurantId) {
      const { data: newRestaurant, error: insertError } = await supabaseAdmin
        .from("restaurants")
        .insert({
          admin_id: adminId,
          restaurant_name: restaurantName,
          restaurant_status: "pending",
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Create restaurant error:", insertError);
        return res.status(500).json({ message: "Failed to create restaurant" });
      }

      restaurantId = newRestaurant.id;

      await supabaseAdmin
        .from("admins")
        .update({ restaurant_id: restaurantId })
        .eq("id", adminId);
    }

    const { error: updateRestaurantError } = await supabaseAdmin
      .from("restaurants")
      .update({
        restaurant_name: restaurantName,
        business_registration_number: registrationNumber || null,
        address,
        city,
        postal_code: postalCode,
        latitude: latitude || null,
        longitude: longitude || null,
        opening_time: openingTime,
        close_time: closeTime,
        logo_url: logoUrl || null,
        cover_image_url: coverImageUrl || null,
      })
      .eq("id", restaurantId);

    if (updateRestaurantError) {
      console.error("Step 2 update error:", updateRestaurantError);
      return res
        .status(500)
        .json({ message: "Failed to update restaurant details" });
    }

    await supabaseAdmin
      .from("admins")
      .update({ onboarding_step: 3 })
      .eq("id", adminId);

    return res.json({
      message: "Restaurant details saved successfully",
      nextStep: 3,
    });
  } catch (e) {
    console.error("/restaurant-onboarding/step-2 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /restaurant-onboarding/step-3
 * Submit restaurant bank details
 */
router.post("/step-3", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { accountHolderName, bankName, branch, accountNumber } = req.body;

    if (!accountHolderName || !bankName || !branch || !accountNumber) {
      return res.status(400).json({
        message:
          "Required fields: accountHolderName, bankName, branch, accountNumber",
      });
    }

    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .single();

    if (adminError) {
      console.error("Admin fetch error:", adminError);
      return res.status(500).json({ message: "Failed to load admin" });
    }

    const { error: bankError } = await supabaseAdmin
      .from("restaurant_bank_accounts")
      .upsert(
        {
          admin_id: adminId,
          restaurant_id: adminData?.restaurant_id || null,
          account_holder_name: accountHolderName,
          bank_name: bankName,
          branch,
          account_number: accountNumber,
        },
        { onConflict: "admin_id,account_number" }
      );

    if (bankError) {
      console.error("Bank upsert error:", bankError);
      return res.status(500).json({ message: "Failed to save bank details" });
    }

    await supabaseAdmin
      .from("admins")
      .update({ onboarding_step: 4 })
      .eq("id", adminId);

    return res.json({
      message: "Bank details saved successfully",
      nextStep: 4,
    });
  } catch (e) {
    console.error("/restaurant-onboarding/step-3 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /restaurant-onboarding/step-4
 * Accept contract and complete onboarding
 */
router.post("/step-4", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const {
      contractAccepted,
      contractVersion,
      ipAddress,
      userAgent,
      contractHtml,
    } = req.body;

    if (!contractAccepted) {
      return res.status(400).json({ message: "Contract must be accepted" });
    }

    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .single();

    if (adminError) {
      console.error("Admin fetch error:", adminError);
      return res.status(500).json({ message: "Failed to load admin" });
    }

    const { error: contractError } = await supabaseAdmin
      .from("restaurant_contracts")
      .insert({
        admin_id: adminId,
        restaurant_id: adminData?.restaurant_id || null,
        contract_version: contractVersion || "1.0.0",
        accepted: true,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        contract_html: contractHtml || null,
      });

    if (contractError) {
      console.error("Contract insert error:", contractError);
      return res.status(500).json({ message: "Failed to save contract" });
    }

    let restaurantId = adminData?.restaurant_id || null;

    if (!restaurantId) {
      const { data: newRestaurant, error: insertError } = await supabaseAdmin
        .from("restaurants")
        .insert({ admin_id: adminId, restaurant_status: "pending" })
        .select("id")
        .single();

      if (insertError) {
        console.error("Create restaurant error:", insertError);
        return res.status(500).json({ message: "Failed to create restaurant" });
      }

      restaurantId = newRestaurant.id;

      await supabaseAdmin
        .from("admins")
        .update({ restaurant_id: restaurantId })
        .eq("id", adminId);
    }

    await supabaseAdmin
      .from("restaurants")
      .update({ restaurant_status: "pending" })
      .eq("id", restaurantId);

    await supabaseAdmin
      .from("admins")
      .update({
        onboarding_step: 4,
        onboarding_completed: true,
        admin_status: "pending",
      })
      .eq("id", adminId);

    return res.json({
      message: "Onboarding completed. Pending manager approval.",
    });
  } catch (e) {
    console.error("/restaurant-onboarding/step-4 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
