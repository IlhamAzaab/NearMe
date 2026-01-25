import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../components/DriverLayout";

export default function DriverDeliveries() {
  const navigate = useNavigate();
  const [active, setActive] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");

  /* ================= AVAILABLE ================= */
  const fetchAvailable = useCallback(async () => {
    try {
      const res = await fetch(
        "http://localhost:5000/driver/deliveries/pending",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      setAvailable(res.ok ? data.deliveries || [] : []);
    } catch (err) {
      console.error(err);
      setAvailable([]);
    }
  }, [token]);

  /* ================= ACTIVE ================= */
  const fetchActive = useCallback(async () => {
    try {
      const res = await fetch(
        "http://localhost:5000/driver/deliveries/active",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      setActive(res.ok ? data.deliveries || [] : []);
    } catch (err) {
      console.error(err);
      setActive([]);
    }
  }, [token]);

  /* ================= ACCEPT ================= */
  const acceptDelivery = async (deliveryId) => {
    try {
      await fetch(
        `http://localhost:5000/driver/deliveries/${deliveryId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // refresh both lists
      fetchAvailable();
      fetchActive();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAvailable(), fetchActive()]).finally(() =>
      setLoading(false)
    );

    const interval = setInterval(() => {
      fetchAvailable();
      fetchActive();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchAvailable, fetchActive]);

  if (loading) return <p>Loading deliveries...</p>;

return (
  <DriverLayout>
    <div>
      <h2>Active Deliveries</h2>
      {active.length === 0 && <p>No active deliveries</p>}

      {active.map(d => (
        <div key={d.delivery_id} style={{ border: "1px solid #4caf50", margin: 8, padding: 8 }}>
          <p><b>Order:</b> {d.order.order_number}</p>
          <p><b>Status:</b> {d.delivery_status}</p>
          <p><b>Restaurant:</b> {d.order.restaurant_name}</p>
          <p><b>Delivery:</b> {d.order.total_amount}</p>
          <button
            onClick={() => navigate(`/driver/delivery/active/${d.id}/map`)}
            style={{
              marginTop: 8,
              padding: "6px 12px",
              backgroundColor: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
            >
              🗺️ Find Route
            </button>
        </div>
      ))}
    </div>
  </DriverLayout>
);
}
