import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";

const router = express.Router();

/**
 * GET /public/restaurants
 * Get all active restaurants with search capability
 */
router.get("/restaurants", async (req, res) => {
  try {
    const { search } = req.query;

    let query = supabaseAdmin
      .from("restaurants")
      .select("*")
      .eq("restaurant_status", "active")
      .order("restaurant_name", { ascending: true });

    // Add search filter if provided
    if (search && search.trim()) {
      query = query.or(
        `restaurant_name.ilike.%${search}%,city.ilike.%${search}%,address.ilike.%${search}%`
      );
    }

    const { data: restaurants, error } = await query;

    if (error) {
      console.error("Fetch restaurants error:", error);
      return res.status(500).json({ message: "Failed to fetch restaurants" });
    }

    return res.json({ restaurants: restaurants || [] });
  } catch (e) {
    console.error("/public/restaurants error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/**
 * GET /public/restaurants/:restaurantId
 * Get single restaurant details
 */
router.get("/restaurants/:restaurantId", async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const { data: restaurant, error } = await supabaseAdmin
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .eq("restaurant_status", "active")
      .single();

    if (error) {
      console.error("Fetch restaurant error:", error);
      return res.status(404).json({ message: "Restaurant not found" });
    }

    return res.json({ restaurant });
  } catch (e) {
    console.error("/public/restaurants/:restaurantId error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/**
 * GET /public/restaurants/:restaurantId/foods
 * Get all available foods for a specific restaurant with search
 */
router.get("/restaurants/:restaurantId/foods", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { search } = req.query;

    // First verify restaurant exists and is active
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("id", restaurantId)
      .eq("restaurant_status", "active")
      .single();

    if (restaurantError || !restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    let query = supabaseAdmin
      .from("foods")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("name", { ascending: true });

    // Add search filter if provided
    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: foods, error } = await query;

    if (error) {
      console.error("Fetch foods error:", error);
      return res.status(500).json({ message: "Failed to fetch foods" });
    }

    return res.json({ foods: foods || [] });
  } catch (e) {
    console.error("/public/restaurants/:restaurantId/foods error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

export default router;
