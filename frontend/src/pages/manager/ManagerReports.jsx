import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../components/ManagerSkeleton";

export default function ManagerReports() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <ManagerPageSkeleton type="reports" />;
  }

  return (
    <ManagerPageLayout title="Reports">
      <div className="p-4 space-y-4 max-w-2xl mx-auto lg:max-w-none">
        {/* Reports Hero */}
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
                assessment
              </span>
            </div>
            <h2 className="text-[#111816] text-2xl font-bold mb-2">
              Reports & Analytics
            </h2>
            <p className="text-[#111816]/70 text-sm">
              Explore detailed analytics to understand and improve your platform
            </p>
          </div>
        </div>

        {/* Active Pages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            onClick={() => navigate("/manager/reports/operations")}
            className="bg-white rounded-xl border border-[#dbe6e3] p-4 cursor-pointer hover:border-[#13ecb9] hover:shadow-md transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#13ecb9]/10 text-[#13ecb9] flex items-center justify-center">
                <span className="material-symbols-outlined">tune</span>
              </div>
              <h3 className="text-[#111816] font-bold text-sm">
                Operations Config
              </h3>
            </div>
            <p className="text-[#618980] text-xs">
              Configure driver earnings, fees, thresholds, and working hours
            </p>
            <div className="mt-3 flex items-center gap-1 text-[#13ecb9]">
              <span className="material-symbols-outlined text-sm">
                arrow_forward
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider">
                Open
              </span>
            </div>
          </div>
          <div
            onClick={() => navigate("/manager/reports/pending-deliveries")}
            className="bg-white rounded-xl border border-[#dbe6e3] p-4 cursor-pointer hover:border-[#13ecb9] hover:shadow-md transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                <span className="material-symbols-outlined">
                  delivery_dining
                </span>
              </div>
              <h3 className="text-[#111816] font-bold text-sm">
                Pending Deliveries
              </h3>
            </div>
            <p className="text-[#618980] text-xs">
              View deliveries waiting for a driver to accept
            </p>
            <div className="mt-3 flex items-center gap-1 text-[#13ecb9]">
              <span className="material-symbols-outlined text-sm">
                arrow_forward
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider">
                Open
              </span>
            </div>
          </div>
        </div>

        {/* Report Pages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              icon: "trending_up",
              title: "Sales Reports",
              desc: "Track daily, weekly, and monthly sales performance",
              color: "bg-blue-100 text-blue-600",
              path: "/manager/reports/sales",
            },
            {
              icon: "local_shipping",
              title: "Delivery Reports",
              desc: "Monitor delivery metrics and driver performance",
              color: "bg-purple-100 text-purple-600",
              path: "/manager/reports/deliveries",
            },
            {
              icon: "restaurant",
              title: "Restaurant Reports",
              desc: "Analyze restaurant performance and commission reports",
              color: "bg-amber-100 text-amber-600",
              path: "/manager/reports/restaurants",
            },
            {
              icon: "payments",
              title: "Financial Reports",
              desc: "View payment summaries and commission breakdowns",
              color: "bg-green-100 text-green-600",
              path: "/manager/reports/financial",
            },
            {
              icon: "people",
              title: "Customer Reports",
              desc: "Understand customer behavior and order patterns",
              color: "bg-red-100 text-red-600",
              path: "/manager/reports/customers",
            },
            {
              icon: "schedule",
              title: "Time-based Analytics",
              desc: "Peak hours analysis and scheduling insights",
              color: "bg-indigo-100 text-indigo-600",
              path: "/manager/reports/analytics",
            },
          ].map((item, i) => (
            <div
              key={i}
              onClick={() => navigate(item.path)}
              className="bg-white rounded-xl border border-[#dbe6e3] p-4 cursor-pointer hover:border-[#13ecb9] hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center`}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                </div>
                <h3 className="text-[#111816] font-bold text-sm">
                  {item.title}
                </h3>
              </div>
              <p className="text-[#618980] text-xs">{item.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-[#13ecb9]">
                <span className="material-symbols-outlined text-sm">
                  arrow_forward
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider">
                  Open
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ManagerPageLayout>
  );
}
