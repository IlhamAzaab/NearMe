import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

function VerifyEmail() {
  const navigate = useNavigate();

  return (
    <>
      <SiteHeader />
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            OTP Signup Is Active
          </h2>
          <p className="text-gray-600 mb-6">
            Email-link verification is no longer used. Please sign up with phone
            OTP or login with your credentials.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate("/signup")}
              className="w-full bg-orange-500 text-white py-3 px-4 rounded-lg hover:bg-orange-600 transition-colors font-medium"
            >
              Go to Signup
            </button>
            <button
              onClick={() => navigate("/login")}
              className="w-full bg-white border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default VerifyEmail;
