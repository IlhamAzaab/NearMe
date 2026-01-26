import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Checkout from "./Checkout";

/**
 * CheckoutWrapper - Wraps the Checkout component to intercept "Place Order" button clicks,
 * place the order via API, and navigate to the PlacingOrder success screen.
 */
const CheckoutWrapper = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const containerRef = useRef(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const isPlacingRef = useRef(false);

  useEffect(() => {
    // Function to collect checkout data from the page DOM
    const collectCheckoutData = () => {
      const data = {
        address: "",
        city: "",
        deliveryMethod: "meet_at_door",
        deliveryOption: "standard",
        restaurantName: "Restaurant",
        items: [],
        paymentMethod: "cash",
        totalAmount: 0,
        cartId: searchParams.get("cartId"),
        position: null,
        routeInfo: null,
      };

      try {
        // Get address - look for the address text in delivery section
        const allParagraphs = document.querySelectorAll('p');
        allParagraphs.forEach(p => {
          const text = p.textContent.trim();
          // Look for address pattern (contains comma or street indicators)
          if (text.length > 10 && (text.includes(',') || text.includes('Street') || text.includes('Road'))) {
            if (!text.includes('Rs.') && !text.includes('delivery') && !text.includes('Minimum')) {
              data.address = text;
            }
          }
        });

        // Get restaurant name from order summary section
        const headers = document.querySelectorAll('h3');
        headers.forEach(h => {
          if (h.textContent.includes('Order Summary')) {
            const parent = h.closest('div[class*="bg-white"]');
            if (parent) {
              const semibold = parent.querySelector('p[class*="font-semibold"]');
              if (semibold) {
                data.restaurantName = semibold.textContent.trim();
              }
            }
          }
        });

        // Get total amount from the Place Order button
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
          const text = btn.textContent;
          if (text.includes('Place Order') && text.includes('Rs.')) {
            const match = text.match(/Rs\.\s*([\d,]+\.?\d*)/);
            if (match) {
              data.totalAmount = parseFloat(match[1].replace(',', ''));
            }
          }
        });

        // Get cart items
        const itemDivs = document.querySelectorAll('div');
        itemDivs.forEach(div => {
          const text = div.textContent;
          if (text.includes('×') && !text.includes('Order Summary')) {
            const match = text.match(/(\d+)\s*×\s*([^R]+)/);
            if (match && match[2].trim().length > 0 && match[2].trim().length < 50) {
              const itemName = match[2].trim().split('\n')[0].trim();
              if (itemName && !data.items.find(i => i.name === itemName)) {
                data.items.push({
                  quantity: parseInt(match[1]),
                  name: itemName
                });
              }
            }
          }
        });

      } catch (e) {
        console.log('Error collecting checkout data:', e);
      }

      return data;
    };

    // Place order API call
    const placeOrder = async (orderData) => {
      const token = localStorage.getItem("token");
      const cartId = searchParams.get("cartId");
      
      if (!cartId) {
        console.error("No cartId found");
        return null;
      }

      try {
        // We need to get position and routeInfo from the Checkout component's state
        // Since we can't access React state directly, we'll pass minimal data
        // and let the backend handle validation
        
        const response = await fetch("http://localhost:5000/orders/place", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cartId: cartId,
            delivery_address: orderData.address,
            delivery_city: orderData.city,
            payment_method: orderData.paymentMethod,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          return data.order;
        } else {
          console.error("Order failed:", data.message);
          return null;
        }
      } catch (err) {
        console.error("Place order error:", err);
        return null;
      }
    };

    // Click handler to intercept Place Order button
    const handleClick = async (e) => {
      if (isPlacingRef.current) return;

      const target = e.target;
      const button = target.closest('button');
      if (!button) return;

      const buttonText = button.textContent || "";
      const isPlaceOrderButton = 
        buttonText.includes("Place Order") && 
        button.className.includes("bg-[#FF7A00]") &&
        !button.disabled;

      if (isPlaceOrderButton) {
        // Prevent the default action
        e.preventDefault();
        e.stopPropagation();

        isPlacingRef.current = true;
        setIsPlacing(true);

        // Collect checkout data
        const orderData = collectCheckoutData();

        // Place the order
        const order = await placeOrder(orderData);

        if (order) {
          console.log("Order placed successfully:", order);
          // Navigate to the placing order screen with success data
          navigate("/placing-order", { 
            state: {
              ...orderData,
              orderPlaced: true,
              orderId: order.id,
              orderNumber: order.order_number,
              order: order
            },
            replace: true 
          });
        } else {
          isPlacingRef.current = false;
          setIsPlacing(false);
          alert("Failed to place order. Please try again.");
        }
      }
    };

    // Add event listener with capture
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [navigate, searchParams]);

  return (
    <div ref={containerRef}>
      <Checkout />
    </div>
  );
};

export default CheckoutWrapper;
