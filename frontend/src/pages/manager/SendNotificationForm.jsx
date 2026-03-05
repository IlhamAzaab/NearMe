import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import { API_URL } from "../../config";

const ROLE_CONFIG = {
  customer: {
    label: "Customers",
    icon: "person",
    gradient: "from-blue-500 to-blue-600",
    bgLight: "bg-blue-50",
    textColor: "text-blue-600",
    chipBg: "bg-blue-100",
    endpoint: "/manager/customers",
    nameField: "username",
  },
  admin: {
    label: "Restaurant Admins",
    icon: "admin_panel_settings",
    gradient: "from-amber-500 to-orange-500",
    bgLight: "bg-amber-50",
    textColor: "text-amber-600",
    chipBg: "bg-amber-100",
    endpoint: "/manager/admins",
    nameField: "restaurant_name",
  },
  driver: {
    label: "Drivers",
    icon: "delivery_dining",
    gradient: "from-emerald-500 to-teal-500",
    bgLight: "bg-emerald-50",
    textColor: "text-emerald-600",
    chipBg: "bg-emerald-100",
    endpoint: "/manager/drivers",
    nameField: "full_name",
  },
};

export default function SendNotificationForm() {
  const { role } = useParams();
  const navigate = useNavigate();
  const config = ROLE_CONFIG[role];

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [scheduledTime, setScheduledTime] = useState("");
  const [sendToAll, setSendToAll] = useState(true);
  const [recipients, setRecipients] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);

  useEffect(() => {
    if (!config) return;
    fetchRecipients();
  }, [role]);

  const fetchRecipients = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}${config.endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // admins endpoint returns { admins }, drivers returns { drivers }, customers returns { customers }
        const list = data.customers || data.admins || data.drivers || [];
        setRecipients(list);
      }
    } catch (err) {
      console.error("Failed to fetch recipients:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredRecipients = useMemo(() => {
    if (!searchQuery.trim()) return recipients;
    const q = searchQuery.toLowerCase();
    return recipients.filter((r) => {
      const name = (
        r[config.nameField] ||
        r.username ||
        r.full_name ||
        r.email ||
        ""
      ).toLowerCase();
      const email = (r.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [recipients, searchQuery, config]);

  const toggleRecipient = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllVisible = () => {
    const visibleIds = filteredRecipients.map((r) => r.id);
    setSelectedIds((prev) => {
      const combined = new Set([...prev, ...visibleIds]);
      return Array.from(combined);
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const getRecipientDisplayName = (r) => {
    if (role === "admin")
      return r.restaurants?.restaurant_name || r.full_name || r.email;
    if (role === "driver") return r.full_name || r.email;
    return r.username || r.email;
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setResult({ success: false, message: "Title and body are required." });
      return;
    }
    if (!sendToAll && selectedIds.length === 0) {
      setResult({
        success: false,
        message: "Please select at least one recipient.",
      });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const token = localStorage.getItem("token");
      const payload = {
        role,
        title: title.trim(),
        body: body.trim(),
        scheduledTime: sendNow ? null : scheduledTime || null,
        recipientIds: sendToAll ? "all" : selectedIds,
      };

      const res = await fetch(`${API_URL}/manager/send-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult({
          success: true,
          message: data.message || "Notification sent successfully!",
          details: data,
        });
        // Reset form after success
        setTitle("");
        setBody("");
        setSelectedIds([]);
      } else {
        setResult({
          success: false,
          message: data.message || "Failed to send notification.",
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: "Network error. Please try again.",
      });
    } finally {
      setSending(false);
    }
  };

  if (!config) {
    return (
      <ManagerPageLayout title="Send Notification">
        <div className="p-8 text-center">
          <p className="text-red-500">
            Invalid role. Please go back and select a valid role.
          </p>
          <button
            onClick={() => navigate("/manager/send-notification")}
            className="mt-4 px-4 py-2 bg-[#13ecb9] text-[#111816] rounded-lg font-medium"
          >
            Go Back
          </button>
        </div>
      </ManagerPageLayout>
    );
  }

  return (
    <ManagerPageLayout title={`Notify ${config.label}`}>
      <div className="p-4 space-y-5 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/manager/send-notification")}
            className="w-10 h-10 rounded-lg bg-[#f0faf7] flex items-center justify-center hover:bg-[#dbe6e3] transition-colors"
          >
            <span className="material-symbols-outlined text-[#111816]">
              arrow_back
            </span>
          </button>
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-md`}
            >
              <span className="material-symbols-outlined text-white text-2xl">
                {config.icon}
              </span>
            </div>
            <div>
              <h2 className="text-[#111816] text-lg font-bold">
                Send to {config.label}
              </h2>
              <p className="text-[#618980] text-xs">
                {recipients.length} {role}s available
              </p>
            </div>
          </div>
        </div>

        {/* Notification Form */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[#111816] text-sm font-semibold mb-1.5">
              Notification Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Special Offer This Weekend!"
              maxLength={100}
              className="w-full px-4 py-3 rounded-lg border border-[#dbe6e3] text-[#111816] text-sm focus:outline-none focus:border-[#13ecb9] focus:ring-1 focus:ring-[#13ecb9] transition-colors placeholder:text-[#618980]/50"
            />
            <p className="text-[#618980]/60 text-[10px] mt-1 text-right">
              {title.length}/100
            </p>
          </div>

          {/* Body */}
          <div>
            <label className="block text-[#111816] text-sm font-semibold mb-1.5">
              Notification Body *
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your notification message here..."
              maxLength={500}
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-[#dbe6e3] text-[#111816] text-sm focus:outline-none focus:border-[#13ecb9] focus:ring-1 focus:ring-[#13ecb9] transition-colors placeholder:text-[#618980]/50 resize-none"
            />
            <p className="text-[#618980]/60 text-[10px] mt-1 text-right">
              {body.length}/500
            </p>
          </div>

          {/* Scheduled Time */}
          <div>
            <label className="block text-[#111816] text-sm font-semibold mb-2">
              When to Send
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setSendNow(true)}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-all ${
                  sendNow
                    ? "bg-[#13ecb9] text-[#111816] border-[#13ecb9] shadow-sm"
                    : "bg-white text-[#618980] border-[#dbe6e3] hover:border-[#13ecb9]/50"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">
                    bolt
                  </span>
                  Send Now
                </span>
              </button>
              <button
                onClick={() => setSendNow(false)}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-all ${
                  !sendNow
                    ? "bg-[#13ecb9] text-[#111816] border-[#13ecb9] shadow-sm"
                    : "bg-white text-[#618980] border-[#dbe6e3] hover:border-[#13ecb9]/50"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">
                    schedule
                  </span>
                  Schedule
                </span>
              </button>
            </div>
            {!sendNow && (
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full mt-3 px-4 py-3 rounded-lg border border-[#dbe6e3] text-[#111816] text-sm focus:outline-none focus:border-[#13ecb9] focus:ring-1 focus:ring-[#13ecb9]"
              />
            )}
          </div>
        </div>

        {/* Recipients Selection */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] p-5 space-y-4">
          <label className="block text-[#111816] text-sm font-semibold">
            Recipients
          </label>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setSendToAll(true);
                setSelectedIds([]);
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-all ${
                sendToAll
                  ? "bg-[#13ecb9] text-[#111816] border-[#13ecb9] shadow-sm"
                  : "bg-white text-[#618980] border-[#dbe6e3] hover:border-[#13ecb9]/50"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-sm">
                  groups
                </span>
                All {config.label} ({recipients.length})
              </span>
            </button>
            <button
              onClick={() => setSendToAll(false)}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-all ${
                !sendToAll
                  ? "bg-[#13ecb9] text-[#111816] border-[#13ecb9] shadow-sm"
                  : "bg-white text-[#618980] border-[#dbe6e3] hover:border-[#13ecb9]/50"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-sm">
                  person_search
                </span>
                Select Specific
              </span>
            </button>
          </div>

          {!sendToAll && (
            <div className="space-y-3">
              {/* Selected count & chips */}
              {selectedIds.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${config.textColor}`}>
                    {selectedIds.length} selected
                  </span>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {/* Selected chips */}
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedIds.slice(0, 8).map((id) => {
                    const r = recipients.find((x) => x.id === id);
                    if (!r) return null;
                    return (
                      <span
                        key={id}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium ${config.chipBg} ${config.textColor}`}
                      >
                        {getRecipientDisplayName(r)}
                        <button
                          onClick={() => toggleRecipient(id)}
                          className="hover:opacity-70"
                        >
                          <span className="material-symbols-outlined text-[12px]">
                            close
                          </span>
                        </button>
                      </span>
                    );
                  })}
                  {selectedIds.length > 8 && (
                    <span className="text-xs text-[#618980] self-center">
                      +{selectedIds.length - 8} more
                    </span>
                  )}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#618980] text-lg">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${config.label.toLowerCase()}...`}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#dbe6e3] text-sm text-[#111816] focus:outline-none focus:border-[#13ecb9] focus:ring-1 focus:ring-[#13ecb9] placeholder:text-[#618980]/50"
                />
              </div>

              {/* Quick actions */}
              <div className="flex gap-2">
                <button
                  onClick={selectAllVisible}
                  className="text-xs text-[#13ecb9] hover:text-[#0fa883] font-medium"
                >
                  Select all visible ({filteredRecipients.length})
                </button>
              </div>

              {/* Recipient list */}
              <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-[#dbe6e3] p-1">
                {loading ? (
                  <div className="p-4 text-center text-[#618980] text-sm">
                    Loading...
                  </div>
                ) : filteredRecipients.length === 0 ? (
                  <div className="p-4 text-center text-[#618980] text-sm">
                    No {config.label.toLowerCase()} found
                  </div>
                ) : (
                  filteredRecipients.map((r) => {
                    const isSelected = selectedIds.includes(r.id);
                    return (
                      <div
                        key={r.id}
                        onClick={() => toggleRecipient(r.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? `${config.bgLight} border border-current/10`
                            : "hover:bg-[#f0faf7]"
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? `${config.textColor} border-current bg-current/10`
                              : "border-[#dbe6e3]"
                          }`}
                        >
                          {isSelected && (
                            <span className="material-symbols-outlined text-[14px]">
                              check
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#111816] text-sm font-medium truncate">
                            {getRecipientDisplayName(r)}
                          </p>
                          <p className="text-[#618980] text-[11px] truncate">
                            {r.email}
                            {r.city ? ` · ${r.city}` : ""}
                            {r.phone ? ` · ${r.phone}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        {(title.trim() || body.trim()) && (
          <div className="bg-white rounded-xl border border-[#dbe6e3] p-5">
            <h4 className="text-[#111816] text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#13ecb9] text-lg">
                preview
              </span>
              Notification Preview
            </h4>
            <div className="bg-[#f8faf9] rounded-lg p-4 border border-[#dbe6e3]/50">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0`}
                >
                  <span className="material-symbols-outlined text-white text-lg">
                    notifications
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#111816] text-sm font-bold">
                    {title.trim() || "Notification Title"}
                  </p>
                  <p className="text-[#618980] text-xs mt-0.5 whitespace-pre-wrap">
                    {body.trim() || "Notification body will appear here..."}
                  </p>
                  <p className="text-[#618980]/50 text-[10px] mt-2">
                    {sendNow
                      ? "Just now"
                      : scheduledTime
                        ? new Date(scheduledTime).toLocaleString()
                        : "Scheduled"}
                    {" · "}
                    {sendToAll
                      ? `All ${config.label} (${recipients.length})`
                      : `${selectedIds.length} recipient(s)`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Result Message */}
        {result && (
          <div
            className={`rounded-xl p-4 border ${
              result.success
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">
                {result.success ? "check_circle" : "error"}
              </span>
              <p className="text-sm font-medium">{result.message}</p>
            </div>
            {result.success && result.details?.results && (
              <p className="text-xs mt-1 opacity-80">
                Push: {result.details.results.pushSent} · Socket:{" "}
                {result.details.results.socketSent}
                {result.details.results.failed > 0 &&
                  ` · Failed: ${result.details.results.failed}`}
              </p>
            )}
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          className={`w-full py-3.5 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
            sending || !title.trim() || !body.trim()
              ? "bg-[#dbe6e3] text-[#618980] cursor-not-allowed"
              : "bg-gradient-to-r from-[#13ecb9] to-[#0fa883] text-[#111816] shadow-lg shadow-[#13ecb9]/30 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
          }`}
        >
          {sending ? (
            <>
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Sending...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined">send</span>
              {sendNow ? "Send Notification" : "Schedule Notification"}
            </>
          )}
        </button>
      </div>
    </ManagerPageLayout>
  );
}
