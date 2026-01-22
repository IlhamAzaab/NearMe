import React from 'react';
import { Link } from 'react-router-dom';

const Welcome = () => {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative bg-gradient-to-br from-green-50 via-white to-emerald-50">
            {/* Subtle background pattern */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,_rgb(34_197_94_/_0.15)_1px,_transparent_0)] bg-[length:24px_24px]"></div>
            </div>
            
            {/* Animated background blobs */}
            <div className="absolute top-0 left-0 w-98 h-98 bg-green-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-96 h-96 bg-teal-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

            {/* Main content - Light card style */}
            <div className="w-full max-w-md backdrop-blur-xl bg-white/90 border border-green-100 rounded-3xl shadow-2xl shadow-green-100/50 p-8 transform transition-all duration-500 animate-fade-in-down z-10">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-block mb-6 p-3 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl shadow-lg">
                        <svg
                            className="w-8 h-8 text-white"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                        </svg>
                    </div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 bg-clip-text text-transparent mb-4 animate-fade-in tracking-tight">
                        Welcome!
                    </h1>
                    <p className="text-gray-500 text-sm animate-fade-in animation-delay-100">
                        Finding nearby restaurants made easy
                    </p>
                </div>

                {/* Bike illustration */}
                <div className="flex justify-center mb-10">
                    <div className="w-32 h-32 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center border border-green-200">
                        <svg className="w-16 h-16 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/>
                        </svg>
                    </div>
                </div>

                {/* Buttons */}
                <div className="space-y-4">
                    <Link 
                        to="/login" 
                        className="block w-full py-4 px-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-center font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-green-200 active:scale-95 animate-fade-in animation-delay-200"
                    >
                        Login
                    </Link>
                    <Link 
                        to="/signup" 
                        className="block w-full py-4 px-6 bg-gray-50 border border-gray-200 text-gray-700 text-center font-bold rounded-xl hover:bg-gray-100 hover:border-green-300 transition-all duration-300 active:scale-95 animate-fade-in animation-delay-300"
                    >
                        Sign Up
                    </Link>
                </div>

                {/* Footer text */}
                <p className="text-center text-gray-400 text-xs mt-8 animate-fade-in animation-delay-400">
                    Fastest delivery at your doorstep
                </p>
            </div>
        </div>
    );
};

export default Welcome;
