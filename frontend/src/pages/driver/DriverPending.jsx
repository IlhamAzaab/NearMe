import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config";
import platformLogo from "../../assets/NearMeLogoArtboard5.svg";

function StepProgress({ currentStep, totalSteps }) {
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-sm font-medium text-green-600">
          {Math.round((currentStep / totalSteps) * 100)}% Complete
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-linear-to-r from-green-500 to-green-600 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        ></div>
      </div>
      <div className="flex justify-between mt-3">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                i + 1 < currentStep
                  ? "bg-green-500 text-white"
                  : i + 1 === currentStep
                    ? "bg-green-600 text-white ring-4 ring-green-200"
                    : "bg-gray-300 text-gray-600"
              }`}
            >
              {i + 1 < currentStep ? (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className="text-xs mt-1 text-gray-600 hidden sm:block">
              {["Personal", "Vehicle", "Documents", "Bank", "Contract"][i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DriverPending() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (!token || role !== "driver") {
      navigate("/login", { replace: true });
    }
  }, [navigate, role, token]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elements = document.querySelectorAll(".floating");
      elements.forEach((el) => {
        el.style.transform = `translateY(${Math.sin(Date.now() / 1000 + Array.from(elements).indexOf(el)) * 5}px)`;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const handleNavigateToDashboard = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      navigate("/driver/dashboard", { replace: true });
    }, 500);
  };

  const loadStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : null;

      if (res.ok && data?.driver) {
        setStatus(data.driver);

        if (!data.driver.onboarding_completed) {
          const step = data.driver.onboarding_step || 1;
          navigate(`/driver/onboarding/step-${step}`, { replace: true });
          return;
        }

        const driverStatus = String(
          data.driver.driver_status || "",
        ).toLowerCase();
        if (driverStatus === "active") {
          setTimeout(() => {
            handleNavigateToDashboard();
          }, 1500);
        }
      } else if (!res.ok) {
        console.error("Driver pending status request failed", res.status);
      }
    } catch (e) {
      console.error("Driver pending status error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [token]);

  useEffect(() => {
    const pollInterval = setInterval(() => {
      loadStatus();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [token, navigate]);

  const driverStatus = String(status?.driver_status || "pending").toLowerCase();

  return (
    <div
      className={`min-h-screen flex items-center justify-center bg-linear-to-br from-green-500 via-green-600 to-green-700 p-4 overflow-hidden relative transition-transform duration-500 ease-in-out ${isTransitioning ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100"}`}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-linear-to-r from-green-400/30 to-green-500/30 floating animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-linear-to-r from-green-300/25 to-green-400/25 floating animate-pulse-slower"></div>
        <div className="absolute top-1/3 right-1/3 w-48 h-48 rounded-full bg-linear-to-r from-green-200/20 to-green-300/20 floating animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/2 w-40 h-40 rounded-full bg-linear-to-r from-green-300/25 to-green-300/25 animate-ping-slow"></div>

        <div className="absolute inset-0">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 bg-linear-to-b from-transparent via-white/25 to-transparent animate-slide-down"
              style={{
                left: `${i * 10}%`,
                height: "100%",
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${3 + i * 0.2}s`,
              }}
            ></div>
          ))}
        </div>

        <div className="absolute inset-0">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute h-px bg-linear-to-r from-transparent via-green-400/20 to-transparent animate-slide-diagonal"
              style={{
                top: `${i * 20}%`,
                width: "200%",
                animationDelay: `${i * 0.5}s`,
              }}
            ></div>
          ))}
        </div>

        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute h-1 bg-linear-to-r from-transparent via-white/30 to-transparent"
              style={{
                top: `${i * 12.5}%`,
                width: "200%",
                animation: `speedLine ${2 + i * 0.3}s linear infinite`,
                animationDelay: `${i * 0.2}s`,
                transform: `translateX(-100%)`,
              }}
            ></div>
          ))}
        </div>
      </div>

      <div className="max-w-xl w-full mx-auto bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 text-center relative z-10">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <img
              src={platformLogo}
              alt="Meezo logo"
              className="w-40 h-auto mx-auto drop-shadow-md"
            />
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded-full animate-ping"></div>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-4 bg-linear-to-r from-green-600 to-green-600 bg-clip-text text-transparent">
          Your application is under review
        </h1>
        <p className="text-gray-600 mb-4 text-lg">
          A manager will verify your details and activate your account. You will
          be notified once approved.
        </p>

        <StepProgress currentStep={5} totalSteps={5} />

        <div className="w-full max-w-md mb-8">
          <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
            <div className="absolute inset-0 bg-linear-to-r from-transparent via-green-500 to-transparent animate-scan-line"></div>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="animate-spin h-10 w-10 text-green-500"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p className="text-sm text-gray-500 font-medium">
              Loading status...
            </p>
          </div>
        )}

        {!loading && status && (
          <div className="space-y-4">
            <div
              className={`bg-linear-to-r ${driverStatus === "active" ? "from-green-100 to-green-200 border-green-400" : "from-green-50 to-green-100 border-green-200"} border-2 rounded-xl p-6 text-center shadow-lg transition-all duration-500`}
            >
              <p className="flex justify-center items-center gap-3">
                <span className="text-lg font-semibold text-gray-800">
                  Driver Status:
                </span>
                <span
                  className={`bg-white px-4 py-2 rounded-lg font-semibold shadow-sm text-lg ${driverStatus === "active" ? "text-green-700 ring-2 ring-green-500" : "text-green-600"}`}
                >
                  {status.driver_status}
                </span>
              </p>
              {driverStatus === "active" && (
                <p className="mt-4 text-sm text-green-700 font-medium animate-pulse">
                  Approved! Redirecting to dashboard...
                </p>
              )}
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
              <p className="text-sm text-gray-700 font-semibold mb-2">
                Need Help?
              </p>
              <p className="text-sm text-gray-600 mb-2">
                Contact our support team for assistance:
              </p>
              <div className="text-sm text-gray-700 space-y-1">
                <p>Email: support.meezo@gmail.com</p>
                <p>Phone: 0759587979</p>
              </div>
            </div>

            {driverStatus === "active" ? (
              <button
                onClick={handleNavigateToDashboard}
                className="w-full bg-linear-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 px-6 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <span>Go to Dashboard</span>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </button>
            ) : (
              <button
                onClick={loadStatus}
                className="w-full bg-linear-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 px-6 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              >
                Refresh Status
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes speedLine {
          0% { transform: translateX(-100%) translateY(0); }
          100% { transform: translateX(100%) translateY(0); }
        }

        @keyframes scan-line {
          0% {
            transform: translateX(-100%);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            transform: translateX(200%);
            opacity: 0;
          }
        }

        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite;
          width: 50%;
        }
      `}</style>
    </div>
  );
}
