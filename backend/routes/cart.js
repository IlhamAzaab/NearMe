import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  getCartItemPrices,
  calculateCustomerPrice,
} from "../utils/commission.js";
import {
  isFoodAvailableNow,
  getSriLankaTimeString,
} from "../utils/restaurantScheduler.js";

const router = express.Router();

/**
 * POST /cart/add
 * Add item to cart (creates cart if doesn't exist)
 * Only customers can add to cart
 */
router.post("/add", authenticate, async (req, res) => {
  try {
    const { restaurant_id, food_id, size, quantity } = req.body;
    const customer_id = req.user.id;

    // Verify user is a customer
    if (req.user.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customers can add items to cart" });
    }

    // Validate input
    if (!restaurant_id || !food_id || !quantity) {
      return res.status(400).json({
        message: "restaurant_id, food_id, and quantity are required",
      });
    }

    if (quantity < 1) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }

    if (size && !["regular", "large"].includes(size)) {
      return res
        .status(400)
        .json({ message: "Size must be 'regular' or 'large'" });
    }

    // STEP 1: Get food details with current price (no is_available filter)
    const { data: food, error: foodError } = await supabaseAdmin
      .from("foods")
      .select(
        "id, name, image_url, regular_price, extra_price, offer_price, extra_offer_price, regular_size, extra_size, is_available, is_manually_unavailable, available_time",
      )
      .eq("id", food_id)
      .eq("restaurant_id", restaurant_id)
      .single();

    if (foodError || !food) {
      return res.status(404).json({
        message: "Food not found",
      });
    }

    // Real-time availability check (admin toggle + time-slot)
    const currentTime = getSriLankaTimeString();
    const timeAvailable = isFoodAvailableNow(food.available_time, currentTime);
    const effectiveAvailable = food.is_manually_unavailable
      ? false
      : food.is_available && timeAvailable;

    if (!effectiveAvailable) {
      // Build a friendly message
      let reason = "This food is currently not available";
      if (food.is_manually_unavailable) {
        reason = `${food.name} has been marked as unavailable by the restaurant`;
      } else if (!timeAvailable && food.available_time?.length > 0) {
        const slots = food.available_time
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(", ");
        reason = `${food.name} is only available during ${slots} time`;
      }
      return res.status(400).json({
        message: reason,
        unavailable: true,
      });
    }

    // STEP 1.5: Check if restaurant is open
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .select("id, is_open, restaurant_name")
      .eq("id", restaurant_id)
      .eq("restaurant_status", "active")
      .maybeSingle();

    if (restaurantError || !restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    if (restaurant.is_open === false) {
      return res.status(400).json({
        message: `${restaurant.restaurant_name} is currently closed`,
        closed: true,
      });
    }

    // Determine size and get prices with commission
    let actualSize = size;
    if (!actualSize) {
      actualSize = "regular";
    } else if (actualSize === "large") {
      if (!food.extra_price) {
        return res.status(400).json({
          message: "Large size not available for this food",
        });
      }
    }

    // Get prices with commission calculation
    const { adminPrice, customerPrice, commission } = await getCartItemPrices(
      food,
      actualSize,
    );

    // unit_price is the customer price (with commission)
    const unit_price = customerPrice;
    const admin_unit_price = adminPrice;
    const total_price = (parseFloat(unit_price) * quantity).toFixed(2);
    const admin_total_price = (parseFloat(admin_unit_price) * quantity).toFixed(
      2,
    );

    // STEP 2: Check for existing active cart for this customer + restaurant
    const { data: existingCart, error: cartCheckError } = await supabaseAdmin
      .from("carts")
      .select("id")
      .eq("customer_id", customer_id)
      .eq("restaurant_id", restaurant_id)
      .eq("status", "active")
      .maybeSingle();

    if (cartCheckError) {
      console.error("Cart check error:", cartCheckError);
      return res.status(500).json({ message: "Failed to check cart" });
    }

    let cart_id;

    if (existingCart) {
      // Use existing cart
      cart_id = existingCart.id;
    } else {
      // STEP 3: Create new cart
      const { data: newCart, error: createCartError } = await supabaseAdmin
        .from("carts")
        .insert({
          customer_id,
          restaurant_id,
          status: "active",
        })
        .select("id")
        .single();

      if (createCartError) {
        console.error("Create cart error:", createCartError);
        return res.status(500).json({ message: "Failed to create cart" });
      }

      cart_id = newCart.id;
    }

    // STEP 4: Check if item already exists in cart (same food + size)
    const { data: existingItem, error: itemCheckError } = await supabaseAdmin
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cart_id)
      .eq("food_id", food_id)
      .eq("size", actualSize)
      .maybeSingle();

    if (itemCheckError && itemCheckError.code !== "PGRST116") {
      console.error("Item check error:", itemCheckError);
      return res.status(500).json({ message: "Failed to check cart item" });
    }

    let cartItem;

    if (existingItem) {
      // Update quantity of existing item
      const newQuantity = existingItem.quantity + quantity;
      const newTotalPrice = (parseFloat(unit_price) * newQuantity).toFixed(2);
      const newAdminTotalPrice = (
        parseFloat(admin_unit_price) * newQuantity
      ).toFixed(2);

      const { data: updatedItem, error: updateError } = await supabaseAdmin
        .from("cart_items")
        .update({
          quantity: newQuantity,
          unit_price: unit_price,
          total_price: newTotalPrice,
          admin_unit_price: admin_unit_price,
          admin_total_price: newAdminTotalPrice,
          commission_per_item: commission,
        })
        .eq("id", existingItem.id)
        .select()
        .single();

      if (updateError) {
        console.error("Update item error:", updateError);
        return res.status(500).json({ message: "Failed to update cart item" });
      }

      cartItem = updatedItem;
    } else {
      // Add new item to cart
      const { data: newItem, error: addItemError } = await supabaseAdmin
        .from("cart_items")
        .insert({
          cart_id,
          food_id,
          food_name: food.name,
          food_image_url: food.image_url,
          size: actualSize,
          quantity,
          unit_price: unit_price,
          total_price: total_price,
          admin_unit_price: admin_unit_price,
          admin_total_price: admin_total_price,
          commission_per_item: commission,
        })
        .select()
        .single();

      if (addItemError) {
        console.error("Add item error:", addItemError);
        return res.status(500).json({ message: "Failed to add item to cart" });
      }

      cartItem = newItem;
    }

    return res.status(200).json({
      message: "Item added to cart successfully",
      cart_id,
      item: cartItem,
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * GET /cart
 * Get all active carts for the logged-in customer with current prices
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const customer_id = req.user.id;

    // Verify user is a customer
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view cart" });
    }

    // Get active carts with restaurant info
    const { data: carts, error: cartsError } = await supabaseAdmin
      .from("carts")
      .select(
        `
        id,
        restaurant_id,
        status,
        created_at,
        updated_at,
        restaurants (
          id,
          restaurant_name,
          logo_url,
          address,
          city,
          latitude,
          longitude
        )
      `,
      )
      .eq("customer_id", customer_id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (cartsError) {
      console.error("Fetch carts error:", cartsError);
      return res.status(500).json({ message: "Failed to fetch carts" });
    }

    if (!carts || carts.length === 0) {
      return res.json({ carts: [] });
    }

    // For each cart, get items with CURRENT food prices
    const cartsWithItems = await Promise.all(
      carts.map(async (cart) => {
        const { data: items, error: itemsError } = await supabaseAdmin
          .from("cart_items")
          .select(
            `
            id,
            food_id,
            food_name,
            food_image_url,
            size,
            quantity,
            unit_price,
            total_price,
            admin_unit_price,
            admin_total_price,
            commission_per_item,
            created_at,
            foods (
              id,
              name,
              image_url,
              regular_price,
              extra_price,
              offer_price,
              extra_offer_price,
              is_available,
              is_manually_unavailable,
              available_time
            )
          `,
          )
          .eq("cart_id", cart.id)
          .order("created_at", { ascending: true });

        if (itemsError) {
          console.error("Fetch items error:", itemsError);
          return { ...cart, items: [], cart_total: 0 };
        }

        // Calculate total using CURRENT prices from foods table with commission
        const currentTime = getSriLankaTimeString();
        const itemsWithCurrentPrice = await Promise.all(
          items.map(async (item) => {
            const food = item.foods;
            let current_unit_price = item.unit_price;
            let current_admin_unit_price =
              item.admin_unit_price || item.unit_price;
            let current_commission = item.commission_per_item || 0;

            // Real-time availability check
            const timeAvailable = food
              ? isFoodAvailableNow(food.available_time, currentTime)
              : false;
            const effectiveAvailable = food
              ? food.is_manually_unavailable
                ? false
                : food.is_available && timeAvailable
              : false;

            // Get current price from food if available (with commission)
            if (food && effectiveAvailable) {
              const { adminPrice, customerPrice, commission } =
                await getCartItemPrices(food, item.size);
              current_unit_price = customerPrice;
              current_admin_unit_price = adminPrice;
              current_commission = commission;
            }

            const current_total_price = (
              parseFloat(current_unit_price) * item.quantity
            ).toFixed(2);
            const current_admin_total_price = (
              parseFloat(current_admin_unit_price) * item.quantity
            ).toFixed(2);
            const current_total_commission = (
              parseFloat(current_commission) * item.quantity
            ).toFixed(2);

            return {
              id: item.id,
              food_id: item.food_id,
              food_name: food?.name || item.food_name,
              food_image_url: food?.image_url || item.food_image_url,
              size: item.size,
              quantity: item.quantity,
              unit_price: parseFloat(current_unit_price),
              total_price: parseFloat(current_total_price),
              admin_unit_price: parseFloat(current_admin_unit_price),
              admin_total_price: parseFloat(current_admin_total_price),
              commission_per_item: parseFloat(current_commission),
              total_commission: parseFloat(current_total_commission),
              is_available: effectiveAvailable,
              created_at: item.created_at,
            };
          }),
        );

        const cart_total = itemsWithCurrentPrice.reduce(
          (sum, item) => sum + item.total_price,
          0,
        );
        const admin_total = itemsWithCurrentPrice.reduce(
          (sum, item) => sum + item.admin_total_price,
          0,
        );
        const commission_total = itemsWithCurrentPrice.reduce(
          (sum, item) => sum + item.total_commission,
          0,
        );

        return {
          id: cart.id,
          restaurant_id: cart.restaurant_id,
          restaurant: cart.restaurants,
          status: cart.status,
          items: itemsWithCurrentPrice,
          item_count: items.length,
          total_items: itemsWithCurrentPrice.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          cart_total: parseFloat(cart_total.toFixed(2)),
          admin_total: parseFloat(admin_total.toFixed(2)),
          commission_total: parseFloat(commission_total.toFixed(2)),
          created_at: cart.created_at,
          updated_at: cart.updated_at,
        };
      }),
    );

    return res.json({ carts: cartsWithItems });
  } catch (error) {
    console.error("Get cart error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * PUT /cart/item/:itemId
 * Update cart item quantity
 */
router.put("/item/:itemId", authenticate, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const customer_id = req.user.id;

    if (req.user.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customers can update cart items" });
    }

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }

    // Verify item belongs to customer's active cart
    const { data: item, error: itemError } = await supabaseAdmin
      .from("cart_items")
      .select(
        `
        id,
        cart_id,
        food_id,
        size,
        carts!inner (
          customer_id,
          status
        )
      `,
      )
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    if (item.carts.customer_id !== customer_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (item.carts.status !== "active") {
      return res.status(400).json({ message: "Cannot update completed cart" });
    }

    // Get current food price with commission
    const { data: food, error: foodError } = await supabaseAdmin
      .from("foods")
      .select("regular_price, extra_price, offer_price, extra_offer_price")
      .eq("id", item.food_id)
      .single();

    if (foodError || !food) {
      return res.status(404).json({ message: "Food not found" });
    }

    // Get prices with commission
    const { adminPrice, customerPrice, commission } = await getCartItemPrices(
      food,
      item.size,
    );

    const unit_price = customerPrice;
    const admin_unit_price = adminPrice;
    const total_price = (parseFloat(unit_price) * quantity).toFixed(2);
    const admin_total_price = (parseFloat(admin_unit_price) * quantity).toFixed(
      2,
    );

    // Update item
    const { data: updatedItem, error: updateError } = await supabaseAdmin
      .from("cart_items")
      .update({
        quantity,
        unit_price: unit_price,
        total_price: total_price,
        admin_unit_price: admin_unit_price,
        admin_total_price: admin_total_price,
        commission_per_item: commission,
      })
      .eq("id", itemId)
      .select()
      .single();

    if (updateError) {
      console.error("Update item error:", updateError);
      return res.status(500).json({ message: "Failed to update cart item" });
    }

    return res.json({
      message: "Cart item updated successfully",
      item: updatedItem,
    });
  } catch (error) {
    console.error("Update cart item error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * DELETE /cart/item/:itemId
 * Remove item from cart
 */
router.delete("/item/:itemId", authenticate, async (req, res) => {
  try {
    const { itemId } = req.params;
    const customer_id = req.user.id;

    if (req.user.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customers can remove cart items" });
    }

    // Verify item belongs to customer's cart
    const { data: item, error: itemError } = await supabaseAdmin
      .from("cart_items")
      .select(
        `
        id,
        cart_id,
        carts!inner (
          customer_id
        )
      `,
      )
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    if (item.carts.customer_id !== customer_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Delete item
    const { error: deleteError } = await supabaseAdmin
      .from("cart_items")
      .delete()
      .eq("id", itemId);

    if (deleteError) {
      console.error("Delete item error:", deleteError);
      return res.status(500).json({ message: "Failed to remove cart item" });
    }

    // Check if cart is now empty and delete it
    const { data: remainingItems, error: checkError } = await supabaseAdmin
      .from("cart_items")
      .select("id")
      .eq("cart_id", item.cart_id);

    if (!checkError && remainingItems && remainingItems.length === 0) {
      await supabaseAdmin.from("carts").delete().eq("id", item.cart_id);
    }

    return res.json({ message: "Item removed from cart successfully" });
  } catch (error) {
    console.error("Delete cart item error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * DELETE /cart/:cartId
 * Remove entire cart (all items)
 */
router.delete("/:cartId", authenticate, async (req, res) => {
  try {
    const { cartId } = req.params;
    const customer_id = req.user.id;

    if (req.user.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customers can remove carts" });
    }

    // Verify cart belongs to customer
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("id, customer_id")
      .eq("id", cartId)
      .single();

    if (cartError || !cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    if (cart.customer_id !== customer_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Delete cart (cascade will delete cart_items)
    const { error: deleteError } = await supabaseAdmin
      .from("carts")
      .delete()
      .eq("id", cartId);

    if (deleteError) {
      console.error("Delete cart error:", deleteError);
      return res.status(500).json({ message: "Failed to remove cart" });
    }

    return res.json({ message: "Cart removed successfully" });
  } catch (error) {
    console.error("Delete cart error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * GET /cart/customer-profile
 * Get customer profile data for checkout
 */
router.get("/customer-profile", authenticate, async (req, res) => {
  try {
    const customer_id = req.user.id;

    // Verify user is a customer
    if (req.user.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customers can access this endpoint" });
    }

    // Fetch customer profile
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, username, email, phone, address, city, latitude, longitude")
      .eq("id", customer_id)
      .single();

    if (customerError) {
      console.error("Fetch customer profile error:", customerError);
      return res
        .status(500)
        .json({ message: "Failed to fetch customer profile" });
    }

    if (!customer) {
      return res.status(404).json({ message: "Customer profile not found" });
    }

    return res.json({ customer });
  } catch (error) {
    console.error("Customer profile error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

export default router;
