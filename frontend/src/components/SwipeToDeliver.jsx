import React, { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";

function SwipeToDeliver({
  onSwipe,
  disabled = false,
  buttonText = "SWIPE TO DELIVER",
}) {
  const [swipePosition, setSwipePosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const containerRef = useRef(null);
  const startX = useRef(0);
  const maxSwipe = useRef(0);

  useEffect(() => {
    if (containerRef.current) {
      // Calculate max swipe distance (container width - button width)
      maxSwipe.current = containerRef.current.offsetWidth - 60;
    }
  }, []);

  const handleStart = (clientX) => {
    if (disabled || isCompleted) return;
    setIsDragging(true);
    startX.current = clientX;
  };

  const handleMove = (clientX) => {
    if (!isDragging || disabled || isCompleted) return;

    const diff = clientX - startX.current;
    const newPosition = Math.max(0, Math.min(diff, maxSwipe.current));
    setSwipePosition(newPosition);

    // Check if swiped far enough (80% of total distance)
    if (newPosition >= maxSwipe.current * 0.8) {
      setIsCompleted(true);
      setIsDragging(false);
      setSwipePosition(maxSwipe.current);

      // Trigger immediately - overlay handles the visual feedback
      onSwipe();
    }
  };

  const handleEnd = () => {
    if (isCompleted) return;
    setIsDragging(false);

    // Snap back if not completed
    if (swipePosition < maxSwipe.current * 0.8) {
      setSwipePosition(0);
    }
  };

  // Mouse events
  const handleMouseDown = (e) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

  const handleMouseMove = (e) => {
    handleMove(e.clientX);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // Touch events
  const handleTouchStart = (e) => {
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    handleMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, swipePosition]);

  const swipePercentage = (swipePosition / maxSwipe.current) * 100;

  return (
    <div
      ref={containerRef}
      className={`relative h-14 rounded-full overflow-hidden ${
        disabled ? "bg-gray-300" : "bg-green-500"
      } shadow-lg`}
      style={{
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/* Background text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white font-semibold text-lg tracking-wide">
          {isCompleted ? "COMPLETED!" : buttonText}
        </span>
      </div>

      {/* Progress background */}
      <div
        className={`absolute left-0 top-0 h-full transition-all ${
          isCompleted ? "bg-green-600" : "bg-green-600"
        }`}
        style={{
          width: `${swipePercentage}%`,
          opacity: 0.5,
        }}
      />

      {/* Swipe button */}
      <div
        className={`absolute left-0 top-0 h-full w-14 bg-white rounded-full shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform ${
          disabled ? "cursor-not-allowed" : ""
        } ${isDragging ? "scale-110" : "scale-100"}`}
        style={{
          transform: `translateX(${swipePosition}px)`,
          transition: isDragging
            ? "none"
            : "transform 0.3s ease-out, scale 0.2s",
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={`${isCompleted ? "text-green-600" : "text-green-500"}`}>
          {isCompleted ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <ChevronRight className="w-6 h-6" />
          )}
        </div>
      </div>

      {/* Arrow hints (only show when not dragging and not completed) */}
      {!isDragging && !isCompleted && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex space-x-1 opacity-60">
          <ChevronRight className="w-5 h-5 text-white animate-pulse" />
          <ChevronRight
            className="w-5 h-5 text-white animate-pulse"
            style={{ animationDelay: "0.2s" }}
          />
          <ChevronRight
            className="w-5 h-5 text-white animate-pulse"
            style={{ animationDelay: "0.4s" }}
          />
        </div>
      )}
    </div>
  );
}

export default SwipeToDeliver;
