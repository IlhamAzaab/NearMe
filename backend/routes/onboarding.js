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
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, and PDF allowed."));
    }
  },
});

/**
 * GET /onboarding/status
 * Get driver's current onboarding status
 */
router.get("/status", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select(
        "onboarding_step, onboarding_completed, driver_status, force_password_change"
      )
      .eq("id", driverId)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: "Driver not found" });
    }

    return res.json({ driver: data });
  } catch (e) {
    console.error("/onboarding/status error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /onboarding/upload-document
 * Upload a single document to Cloudinary
 */
router.post(
  "/upload-document",
  authenticate,
  upload.single("file"),
  async (req, res) => {
    try {
      if (req.user.role !== "driver") {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { docType } = req.body;
      const driverId = req.user.id;

      // Upload to Cloudinary
      // Convert buffer to base64 for Cloudinary upload
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;

      const result = await cloudinary.uploader.upload(dataURI, {
        folder: `nearme/driver-documents/${driverId}`,
        public_id: `${docType}_${Date.now()}`,
        resource_type: "auto", // Handles images and PDFs
        overwrite: true,
        access_mode: "public",
      });

      return res.json({
        message: "File uploaded successfully",
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
      });
    } catch (e) {
      console.error("/upload-document error:", e);
      return res
        .status(500)
        .json({ message: "Server error", error: e.message });
    }
  }
);

/**
 * POST /onboarding/step-1
 * Update personal information
 */
router.post("/step-1", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const {
      fullName,
      nicNumber,
      phoneNumber,
      dateOfBirth,
      address,
      city,
      workingTime,
    } = req.body;

    // Validation
    if (
      !fullName ||
      !nicNumber ||
      !phoneNumber ||
      !dateOfBirth ||
      !address ||
      !city ||
      !workingTime
    ) {
      return res.status(400).json({
        message:
          "All fields are required: fullName, nicNumber, phoneNumber, dateOfBirth, address, city, workingTime",
      });
    }

    // Check if NIC already exists for another driver
    const { data: existingDriver } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("nic_number", nicNumber)
      .neq("id", driverId)
      .maybeSingle();

    if (existingDriver) {
      return res.status(409).json({
        message: "NIC number already registered. Please contact support.",
      });
    }

    // Update driver
    const { error } = await supabaseAdmin
      .from("drivers")
      .update({
        full_name: fullName,
        nic_number: nicNumber,
        phone: phoneNumber,
        date_of_birth: dateOfBirth,
        address,
        city,
        working_time: workingTime,
        onboarding_step: 2,
      })
      .eq("id", driverId);

    if (error) {
      console.error("Step 1 update error:", error);
      return res
        .status(500)
        .json({ message: "Failed to update personal information" });
    }

    return res.json({
      message: "Personal information saved successfully",
      nextStep: 2,
    });
  } catch (e) {
    console.error("/onboarding/step-1 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /onboarding/step-2
 * Update vehicle and license details
 */
router.post("/step-2", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const {
      vehicleNumber,
      vehicleType,
      vehicleModel,
      insuranceExpiry,
      vehicleLicenseExpiry,
      drivingLicenseNumber,
      licenseExpiryDate,
    } = req.body;

    // Validation
    if (
      !vehicleNumber ||
      !vehicleType ||
      !vehicleModel ||
      !insuranceExpiry ||
      !vehicleLicenseExpiry ||
      !drivingLicenseNumber ||
      !licenseExpiryDate
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // Validate dates
    const today = new Date();
    if (new Date(insuranceExpiry) <= today) {
      return res
        .status(400)
        .json({ message: "Insurance must be valid (not expired)" });
    }
    if (new Date(vehicleLicenseExpiry) <= today) {
      return res
        .status(400)
        .json({ message: "Vehicle license must be valid (not expired)" });
    }
    if (new Date(licenseExpiryDate) <= today) {
      return res
        .status(400)
        .json({ message: "Driving license must be valid (not expired)" });
    }

    // Check for duplicate vehicle/license numbers
    const { data: existingVehicle } = await supabaseAdmin
      .from("driver_vehicle_license")
      .select("driver_id")
      .or(
        `vehicle_number.eq.${vehicleNumber},driving_license_number.eq.${drivingLicenseNumber}`
      )
      .neq("driver_id", driverId)
      .maybeSingle();

    if (existingVehicle) {
      return res.status(409).json({
        message: "Vehicle number or license number already registered",
      });
    }

    // Insert or update vehicle/license
    const { error: vehicleError } = await supabaseAdmin
      .from("driver_vehicle_license")
      .upsert(
        {
          driver_id: driverId,
          vehicle_number: vehicleNumber,
          vehicle_type: vehicleType,
          vehicle_model: vehicleModel,
          insurance_expiry: insuranceExpiry,
          vehicle_license_expiry: vehicleLicenseExpiry,
          driving_license_number: drivingLicenseNumber,
          license_expiry_date: licenseExpiryDate,
        },
        { onConflict: "driver_id" }
      );

    if (vehicleError) {
      console.error("Vehicle insert error:", vehicleError);
      return res
        .status(500)
        .json({ message: "Failed to save vehicle details" });
    }

    // Update onboarding step
    await supabaseAdmin
      .from("drivers")
      .update({
        onboarding_step: 3,
        driver_type: vehicleType,
      })
      .eq("id", driverId);

    return res.json({
      message: "Vehicle and license details saved successfully",
      nextStep: 3,
    });
  } catch (e) {
    console.error("/onboarding/step-2 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /onboarding/step-3
 * Handle document uploads
 */
router.post("/step-3", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { documents } = req.body; // Array of { documentType, documentUrl }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: "Documents are required" });
    }

    const requiredDocs = [
      "nic_front",
      "nic_back",
      "license_front",
      "license_back",
      "insurance",
      "revenue_license",
    ];
    const providedTypes = documents.map((d) => d.documentType);
    const missingDocs = requiredDocs.filter(
      (doc) => !providedTypes.includes(doc)
    );

    if (missingDocs.length > 0) {
      return res.status(400).json({
        message: `Missing required documents: ${missingDocs.join(", ")}`,
      });
    }

    // Insert documents (upsert to handle re-uploads)
    const docInserts = documents.map((doc) => ({
      driver_id: driverId,
      document_type: doc.documentType,
      document_url: doc.documentUrl,
    }));

    const { error: docError } = await supabaseAdmin
      .from("driver_documents")
      .upsert(docInserts, { onConflict: "driver_id,document_type" });

    if (docError) {
      console.error("Document insert error:", docError);
      return res.status(500).json({ message: "Failed to save documents" });
    }

    // Update onboarding step
    await supabaseAdmin
      .from("drivers")
      .update({ onboarding_step: 4 })
      .eq("id", driverId);

    return res.json({
      message: "Documents uploaded successfully",
      nextStep: 4,
    });
  } catch (e) {
    console.error("/onboarding/step-3 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /onboarding/step-4
 * Save bank account details
 */
router.post("/step-4", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { accountHolderName, bankName, branch, accountNumber } = req.body;

    // Validation
    if (!accountHolderName || !bankName || !branch || !accountNumber) {
      return res.status(400).json({
        message:
          "All fields are required: accountHolderName, bankName, branch, accountNumber",
      });
    }

    // Insert or update bank account
    const { error: bankError } = await supabaseAdmin
      .from("driver_bank_accounts")
      .upsert(
        {
          driver_id: driverId,
          account_holder_name: accountHolderName,
          bank_name: bankName,
          branch,
          account_number: accountNumber,
        },
        { onConflict: "driver_id" }
      );

    if (bankError) {
      console.error("Bank account insert error:", bankError);
      return res.status(500).json({ message: "Failed to save bank account" });
    }

    // Update onboarding step
    await supabaseAdmin
      .from("drivers")
      .update({ onboarding_step: 5 })
      .eq("id", driverId);

    return res.json({
      message: "Bank account details saved successfully",
      nextStep: 5,
    });
  } catch (e) {
    console.error("/onboarding/step-4 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /onboarding/step-5
 * Accept contract and complete onboarding
 */
router.post("/step-5", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
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

    // Check if all required data exists before completing onboarding
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("full_name, nic_number, phone, date_of_birth, address, city")
      .eq("id", driverId)
      .single();

    const { data: vehicleLicense } = await supabaseAdmin
      .from("driver_vehicle_license")
      .select("*")
      .eq("driver_id", driverId)
      .single();

    const { data: documents } = await supabaseAdmin
      .from("driver_documents")
      .select("document_type")
      .eq("driver_id", driverId);

    const { data: bankAccount } = await supabaseAdmin
      .from("driver_bank_accounts")
      .select("*")
      .eq("driver_id", driverId)
      .single();

    // Validate all required data is present
    if (!driver || !driver.full_name || !driver.nic_number || !driver.phone) {
      return res
        .status(400)
        .json({ message: "Please complete Step 1: Personal Information" });
    }

    if (!vehicleLicense) {
      return res
        .status(400)
        .json({ message: "Please complete Step 2: Vehicle & License Details" });
    }

    const requiredDocs = [
      "nic_front",
      "nic_back",
      "license_front",
      "license_back",
      "insurance",
      "revenue_license",
    ];
    const uploadedDocs = documents?.map((d) => d.document_type) || [];
    const missingDocs = requiredDocs.filter(
      (doc) => !uploadedDocs.includes(doc)
    );

    if (missingDocs.length > 0) {
      return res.status(400).json({
        message: `Please complete Step 3: Missing documents - ${missingDocs.join(
          ", "
        )}`,
      });
    }

    if (!bankAccount) {
      return res
        .status(400)
        .json({ message: "Please complete Step 4: Bank Account Details" });
    }

    // Delete any existing contract for this driver and version (handle re-submission)
    await supabaseAdmin
      .from("driver_contracts")
      .delete()
      .eq("driver_id", driverId)
      .eq("contract_version", contractVersion || "1.0");

    // Insert new contract acceptance
    const { error: contractError } = await supabaseAdmin
      .from("driver_contracts")
      .insert({
        driver_id: driverId,
        contract_version: contractVersion || "1.0",
        ip_address: ipAddress,
        user_agent: userAgent,
        contract_html: contractHtml,
        accepted_at: new Date().toISOString(),
      });

    if (contractError) {
      console.error("Contract insert error:", contractError);
      return res
        .status(500)
        .json({ message: "Failed to save contract acceptance" });
    }

    // Complete onboarding - set driver to pending status
    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        onboarding_completed: true,
        driver_status: "pending",
        profile_completed: true,
      })
      .eq("id", driverId);

    if (updateError) {
      console.error("Onboarding completion error:", updateError);
      return res.status(500).json({
        message: "Failed to complete onboarding",
        error: updateError.message,
      });
    }

    return res.json({
      message:
        "Onboarding completed successfully! Your profile is now pending manager verification.",
      status: "pending",
    });
  } catch (e) {
    console.error("/onboarding/step-5 error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
