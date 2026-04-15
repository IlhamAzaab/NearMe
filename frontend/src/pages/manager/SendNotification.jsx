import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../components/ManagerSkeleton";
import { API_URL } from "../../config";

export default function SendNotification() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    fetchHistory();
    return () => clearTimeout(timer);
  }, []);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/manager/notification-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.notifications || []);
      }
    } catch {
      // silent
    }
  };

  if (loading) {
    return <ManagerPageSkeleton type="notification" />;
  }

  const roleCards = [
    {
      role: "customer",
      icon: "person",
      title: "Customers",
      desc: "Send notifications to app customers — promotions, updates, announcements",
      gradient: "from-blue-500 to-blue-600",
      bgLight: "bg-blue-50",
      textColor: "text-blue-600",
      borderColor: "border-blue-200",
    },
    {
      role: "admin",
      icon: "admin_panel_settings",
      title: "Restaurant Admins",
      desc: "Notify restaurant owners about policy changes, updates, or important alerts",
      gradient: "from-amber-500 to-orange-500",
      bgLight: "bg-amber-50",
      textColor: "text-amber-600",
      borderColor: "border-amber-200",
    },
    {
      role: "driver",
      icon: "delivery_dining",
      title: "Drivers",
      desc: "Reach delivery drivers with schedule changes, bonus alerts, or announcements",
      gradient: "from-emerald-500 to-teal-500",
      bgLight: "bg-emerald-50",
      textColor: "text-emerald-600",
      borderColor: "border-emerald-200",
    },
  ];

  return (
    <ManagerPageLayout title="Send Notification">
      <div className="p-4 space-y-6 max-w-2xl mx-auto lg:max-w-none">
        {/* Hero Banner */}
        <div className="bg-gradient-to-br from-[#13ecb9] to-[#0fa883] rounded-xl p-6 shadow-lg shadow-[#13ecb9]/20 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 2px 2px, black 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative z-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-white text-4xl">
                campaign
              </span>
            </div>
            <h2 className="text-[#111816] text-2xl font-bold mb-2">
              Send Notifications
            </h2>
            <p className="text-[#111816]/70 text-sm">
              Reach customers, restaurant admins, or drivers with push &amp;
              in-app notifications
            </p>
          </div>
        </div>

        {/* Role Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {roleCards.map((card) => (
            <div
              key={card.role}
              onClick={() =>
                navigate(`/manager/send-notification/${card.role}`)
              }
              className={`bg-white rounded-xl border ${card.borderColor} p-5 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all active:scale-[0.98] group`}
            >
              <div
                className={`w-14 h-14 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-4 shadow-md group-hover:shadow-lg transition-shadow`}
              >
                <span className="material-symbols-outlined text-white text-3xl">
                  {card.icon}
                </span>
              </div>
              <h3 className="text-[#111816] font-bold text-base mb-2">
                {card.title}
              </h3>
              <p className="text-[#618980] text-xs leading-relaxed mb-4">
                {card.desc}
              </p>
              <div
                className={`flex items-center gap-1 ${card.textColor} font-medium text-sm`}
              >
                <span>Send Now</span>
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Notifications History */}
        {history.length > 0 && (
          <div>
            <h3 className="text-[#111816] font-bold text-base mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#13ecb9]">
                history
              </span>
              Recent Notifications
            </h3>
            <div className="space-y-2">
              {history.slice(0, 10).map((n, i) => (
                <div
                  key={n.id || i}
                  className="bg-white rounded-lg border border-[#dbe6e3] p-3 flex items-start gap-3"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      n.status === "sent"
                        ? "bg-green-100 text-green-600"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {n.status === "sent" ? "check_circle" : "error"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#111816] text-sm font-medium truncate">
                      {n.title}
                    </p>
                    <p className="text-[#618980] text-xs truncate">{n.body}</p>
                    <p className="text-[#618980]/60 text-[10px] mt-1">
                      {new Date(n.created_at).toLocaleString()}
                      {n.data?.recipientCount &&
                        ` · ${n.data.recipientCount} recipients`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ManagerPageLayout>
  );
}
