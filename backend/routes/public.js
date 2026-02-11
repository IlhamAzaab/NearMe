import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { addCustomerPricing } from "../utils/commission.js";
import {
  getSystemConfig,
  getServiceFeeTiers,
  getDeliveryFeeTiers,
} from "../utils/systemConfig.js";

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
        `restaurant_name.ilike.%${search}%,city.ilike.%${search}%,address.ilike.%${search}%`,
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
 * GET /public/foods
 * Get all available foods from all active restaurants with search capability
 */
router.get("/foods", async (req, res) => {
  try {
    const { search } = req.query;

    let query = supabaseAdmin
      .from("foods")
      .select(
        `
        *,
        restaurants!inner (
          id,
          restaurant_name,
          logo_url,
          city,
          restaurant_status,
          is_open,
          opening_time,
          close_time
        )
      `,
      )
      .eq("is_available", true)
      .eq("restaurants.restaurant_status", "active")
      .order("name", { ascending: true });

    // Add search filter if provided
    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: foods, error } = await query;

    if (error) {
      console.error("Fetch all foods error:", error);
      return res.status(500).json({ message: "Failed to fetch foods" });
    }

    // Map the data to include customer prices with commission
    const mappedFoods = (foods || []).map((food) => {
      const pricedFood = addCustomerPricing(food);
      return {
        ...pricedFood,
        // Effective price for display (offer price if exists, otherwise regular)
        price:
          pricedFood.effective_regular_price || pricedFood.regular_price || 0,
      };
    });

    return res.json({ foods: mappedFoods });
  } catch (e) {
    console.error("/public/foods error:", e);
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

    // Add customer pricing with commission to all foods
    const pricedFoods = (foods || []).map((food) => addCustomerPricing(food));

    return res.json({ foods: pricedFoods });
  } catch (e) {
    console.error("/public/restaurants/:restaurantId/foods error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/**
 * GET /public/restaurants/:restaurantId/foods/:foodId
 * Get single food details from a specific restaurant
 */
router.get("/restaurants/:restaurantId/foods/:foodId", async (req, res) => {
  try {
    const { restaurantId, foodId } = req.params;

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

    // Get the food from the restaurant
    const { data: food, error } = await supabaseAdmin
      .from("foods")
      .select("*")
      .eq("id", foodId)
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .single();

    if (error || !food) {
      console.error("Fetch food error:", error);
      return res.status(404).json({ message: "Food not found" });
    }

    // Add customer pricing with commission
    const pricedFood = addCustomerPricing(food);

    return res.json({ food: pricedFood });
  } catch (e) {
    console.error("/public/restaurants/:restaurantId/foods/:foodId error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
});

/**
 * GET /public/fee-config
 * Returns service fee tiers and delivery fee tiers for frontend calculations
 */
router.get("/fee-config", async (req, res) => {
  try {
    const config = await getSystemConfig();
    return res.json({
      service_fee_tiers: getServiceFeeTiers(config),
      delivery_fee_tiers: getDeliveryFeeTiers(config),
    });
  } catch (err) {
    console.error("Fee config fetch error:", err);
    return res.status(500).json({ message: "Failed to fetch fee config" });
  }
});

export default router;
