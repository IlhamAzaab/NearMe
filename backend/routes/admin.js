import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import { v2 as cloudinary } from "cloudinary";

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * GET /admin/me
 * Get admin profile
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from("admins")
      .select(
        "id, email, phone, force_password_change, profile_completed, onboarding_step, onboarding_completed, admin_status, restaurant_id",
      )
      .eq("id", adminId)
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({ message: "Admin profile not found" });
    }

    return res.json({ admin: data });
  } catch (e) {
    console.error("/admin/me error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/restaurant
 * Get the logged-in admin's restaurant details
 */
router.get("/restaurant", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Fetch restaurant details
    const { data: restaurant, error } = await supabaseAdmin
      .from("restaurants")
      .select("*")
      .eq("id", admin.restaurant_id)
      .maybeSingle();

    if (error || !restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    return res.json({ restaurant });
  } catch (e) {
    console.error("/admin/restaurant GET error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/restaurant
 * Update the logged-in admin's restaurant details
 */
router.patch("/restaurant", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const updateData = req.body || {};

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Build update object with only provided fields
    const cleanData = {};
    if (updateData.restaurant_name !== undefined)
      cleanData.restaurant_name = updateData.restaurant_name;
    if (updateData.address !== undefined)
      cleanData.address = updateData.address;
    if (updateData.city !== undefined) cleanData.city = updateData.city;
    if (updateData.postal_code !== undefined)
      cleanData.postal_code = updateData.postal_code;
    if (updateData.opening_time !== undefined)
      cleanData.opening_time = updateData.opening_time;
    if (updateData.close_time !== undefined)
      cleanData.close_time = updateData.close_time;
    if (updateData.logo_url !== undefined)
      cleanData.logo_url = updateData.logo_url;
    if (updateData.cover_image_url !== undefined)
      cleanData.cover_image_url = updateData.cover_image_url;
    if (updateData.latitude !== undefined)
      cleanData.latitude = updateData.latitude;
    if (updateData.longitude !== undefined)
      cleanData.longitude = updateData.longitude;

    cleanData.updated_at = new Date().toISOString();

    // Update restaurant
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("restaurants")
      .update(cleanData)
      .eq("id", admin.restaurant_id)
      .select()
      .maybeSingle();

    if (updateError || !updated) {
      console.error("Update error:", updateError);
      return res.status(500).json({ message: "Failed to update restaurant" });
    }

    return res.json({ restaurant: updated });
  } catch (e) {
    console.error("/admin/restaurant PATCH error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});
router.put("/update-profile", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { username, phone, newPassword } = req.body || {};

    // Check if profile already completed
    const { data: currentProfile, error: fetchError } = await supabaseAdmin
      .from("admins")
      .select("profile_completed")
      .eq("id", adminId)
      .maybeSingle();

    if (fetchError || !currentProfile) {
      return res.status(404).json({ message: "Admin profile not found" });
    }

    if (currentProfile.profile_completed) {
      return res.status(400).json({
        message: "Profile already completed. No further changes allowed.",
      });
    }

    // Validate required fields
    if (!username || !phone || !newPassword) {
      return res
        .status(400)
        .json({ message: "username, phone, and newPassword are required" });
    }

    // Update password in Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      adminId,
      { password: newPassword },
    );

    if (authError) {
      console.error("Password update error:", authError);
      return res.status(500).json({ message: "Failed to update password" });
    }

    // Update admins table
    const { error: updateError } = await supabaseAdmin
      .from("admins")
      .update({
        phone,
        force_password_change: false,
        profile_completed: true,
      })
      .eq("id", adminId);

    if (updateError) {
      console.error("Profile update error:", updateError);
      return res.status(500).json({ message: "Failed to update profile" });
    }

    return res.json({
      message: "Profile updated successfully. No further changes allowed.",
    });
  } catch (e) {
    console.error("/admin/update-profile error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/stats
 * Basic dashboard metrics for admin
 */
router.get("/stats", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Total orders
    const { count: ordersCount, error: ordersErr } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true });

    if (ordersErr) throw ordersErr;

    // Active deliveries (not delivered/failed/cancelled)
    const { count: activeDeliveries, error: deliveriesErr } =
      await supabaseAdmin
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .not("status", "in", "(delivered,failed,cancelled)");

    if (deliveriesErr) throw deliveriesErr;

    // Restaurants
    const { count: restaurantsCount, error: restErr } = await supabaseAdmin
      .from("restaurants")
      .select("id", { count: "exact", head: true });

    if (restErr) throw restErr;

    // Drivers
    const { count: driversCount, error: driversErr } = await supabaseAdmin
      .from("drivers")
      .select("id", { count: "exact", head: true });

    if (driversErr) throw driversErr;

    return res.json({
      stats: {
        total_orders: ordersCount || 0,
        active_deliveries: activeDeliveries || 0,
        restaurants: restaurantsCount || 0,
        drivers: driversCount || 0,
      },
    });
  } catch (e) {
    console.error("/admin/stats error:", e);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

/**
 * PUT /admin/change-password
 * Change admin password (for forced password change)
 */
router.put("/change-password", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { username, newPassword } = req.body;

    // Validation
    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    // Update password in Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      adminId,
      { password: newPassword },
    );

    if (authError) {
      console.error("Password update error:", authError);
      return res.status(500).json({ message: "Failed to update password" });
    }

    // Update admins table - clear force_password_change flag
    const { error: updateError } = await supabaseAdmin
      .from("admins")
      .update({
        force_password_change: false,
      })
      .eq("id", adminId);

    if (updateError) {
      console.error("Admin update error:", updateError);
      return res.status(500).json({ message: "Failed to update admin record" });
    }

    return res.json({
      message: "Password changed successfully",
    });
  } catch (e) {
    console.error("/admin/change-password error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/foods
 * List all foods for the admin's restaurant
 */
router.get("/foods", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const { data: foods, error } = await supabaseAdmin
      .from("foods")
      .select(
        "id, name, description, image_url, is_available, available_time, regular_size, regular_portion, regular_price, offer_price, extra_size, extra_portion, extra_price, stars, created_at",
      )
      .eq("restaurant_id", admin.restaurant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch foods error:", error);
      return res.status(500).json({ message: "Failed to fetch foods" });
    }

    return res.json({ foods: foods || [] });
  } catch (e) {
    console.error("/admin/foods error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /admin/foods
 * Add a new food/product
 */
router.post("/foods", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const {
      name,
      description,
      image_url,
      available_time,
      regular_size,
      regular_portion,
      regular_price,
      offer_price,
      extra_size,
      extra_portion,
      extra_price,
    } = req.body || {};

    // Validate required fields
    if (
      !name ||
      !regular_price ||
      !available_time ||
      available_time.length === 0
    ) {
      return res.status(400).json({
        message: "name, regular_price, and available_time are required",
      });
    }

    const { data: food, error } = await supabaseAdmin
      .from("foods")
      .insert({
        restaurant_id: admin.restaurant_id,
        name: name.trim(),
        description: description?.trim() || null,
        image_url: image_url || null,
        available_time,
        regular_size: regular_size?.trim() || null,
        regular_portion: regular_portion?.trim() || null,
        regular_price: parseFloat(regular_price),
        offer_price: offer_price ? parseFloat(offer_price) : null,
        extra_size: extra_size?.trim() || null,
        extra_portion: extra_portion?.trim() || null,
        extra_price: extra_price ? parseFloat(extra_price) : null,
        is_available: true,
      })
      .select();

    if (error) {
      console.error("Create food error:", error);
      return res.status(500).json({ message: "Failed to create food" });
    }

    return res
      .status(201)
      .json({ message: "Food added successfully", food: food[0] });
  } catch (e) {
    console.error("/admin/foods POST error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/foods/:foodId
 * Get a specific food details
 */
router.get("/foods/:foodId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { foodId } = req.params;

    const { data: food, error } = await supabaseAdmin
      .from("foods")
      .select("*")
      .eq("id", foodId)
      .maybeSingle();

    if (error || !food) {
      return res.status(404).json({ message: "Food not found" });
    }

    // Verify admin owns this restaurant
    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (food.restaurant_id !== admin.restaurant_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    return res.json({ food });
  } catch (e) {
    console.error("/admin/foods/:foodId GET error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/foods/:foodId
 * Update a food/product
 */
router.patch("/foods/:foodId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { foodId } = req.params;
    const updateData = req.body || {};

    // Verify admin owns this food
    const { data: food, error: foodError } = await supabaseAdmin
      .from("foods")
      .select("restaurant_id")
      .eq("id", foodId)
      .maybeSingle();

    if (foodError || !food) {
      return res.status(404).json({ message: "Food not found" });
    }

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (food.restaurant_id !== admin.restaurant_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Build update object
    const cleanData = {};
    if (updateData.name !== undefined) cleanData.name = updateData.name.trim();
    if (updateData.description !== undefined)
      cleanData.description = updateData.description?.trim() || null;
    if (updateData.image_url !== undefined)
      cleanData.image_url = updateData.image_url;
    if (updateData.is_available !== undefined)
      cleanData.is_available = updateData.is_available;
    if (updateData.available_time !== undefined)
      cleanData.available_time = updateData.available_time;
    if (updateData.regular_size !== undefined)
      cleanData.regular_size = updateData.regular_size?.trim() || null;
    if (updateData.regular_portion !== undefined)
      cleanData.regular_portion = updateData.regular_portion?.trim() || null;
    if (updateData.regular_price !== undefined)
      cleanData.regular_price = parseFloat(updateData.regular_price);
    if (updateData.offer_price !== undefined)
      cleanData.offer_price = updateData.offer_price
        ? parseFloat(updateData.offer_price)
        : null;
    if (updateData.extra_size !== undefined)
      cleanData.extra_size = updateData.extra_size?.trim() || null;
    if (updateData.extra_portion !== undefined)
      cleanData.extra_portion = updateData.extra_portion?.trim() || null;
    if (updateData.extra_price !== undefined)
      cleanData.extra_price = updateData.extra_price
        ? parseFloat(updateData.extra_price)
        : null;

    cleanData.updated_at = new Date().toISOString();

    const { data: updatedFood, error } = await supabaseAdmin
      .from("foods")
      .update(cleanData)
      .eq("id", foodId)
      .select();

    if (error) {
      console.error("Update food error:", error);
      return res.status(500).json({ message: "Failed to update food" });
    }

    return res.json({
      message: "Food updated successfully",
      food: updatedFood[0],
    });
  } catch (e) {
    console.error("/admin/foods/:foodId PATCH error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /admin/foods/:foodId
 * Delete a food/product
 */
router.delete("/foods/:foodId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { foodId } = req.params;

    // Verify admin owns this food
    const { data: food, error: foodError } = await supabaseAdmin
      .from("foods")
      .select("restaurant_id")
      .eq("id", foodId)
      .maybeSingle();

    if (foodError || !food) {
      return res.status(404).json({ message: "Food not found" });
    }

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (food.restaurant_id !== admin.restaurant_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { error } = await supabaseAdmin
      .from("foods")
      .delete()
      .eq("id", foodId);

    if (error) {
      console.error("Delete food error:", error);
      return res.status(500).json({ message: "Failed to delete food" });
    }

    return res.json({ message: "Food deleted successfully" });
  } catch (e) {
    console.error("/admin/foods/:foodId DELETE error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /admin/upload-image
 * Upload image to Cloudinary and return URL
 */
router.post("/upload-image", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ message: "Image data is required" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(imageData, {
      folder: "nearme/food-products",
      resource_type: "auto",
    });

    return res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (e) {
    console.error("/admin/upload-image error:", e);
    return res.status(500).json({ message: "Failed to upload image" });
  }
});

/**
 * GET /admin/notifications
 * Get notifications for admin
 */
router.get("/notifications", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("recipient_id", adminId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Notifications fetch error:", error);
      return res.status(500).json({ message: "Failed to fetch notifications" });
    }

    return res.json({ notifications: data || [] });
  } catch (e) {
    console.error("/admin/notifications error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/notifications/mark-all-read
 * Mark all unread notifications as read
 * IMPORTANT: This must come BEFORE /:id/read route
 */
router.patch("/notifications/mark-all-read", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", adminId)
      .eq("is_read", false)
      .select();

    if (error) {
      console.error("Mark all read error:", error);
      return res.status(500).json({ message: "Failed to mark all as read" });
    }

    return res.json({ success: true, updated: data?.length || 0 });
  } catch (e) {
    console.error("/admin/notifications/mark-all-read error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/notifications/:id/read
 * Mark notification as read
 */
router.patch("/notifications/:id/read", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const notificationId = req.params.id;

    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_id", adminId);

    if (error) {
      console.error("Mark read error:", error);
      return res.status(500).json({ message: "Failed to mark as read" });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error("/admin/notifications/:id/read error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
