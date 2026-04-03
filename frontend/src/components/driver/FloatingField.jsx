import React, { useMemo, useState } from "react";

export default function FloatingField({
  label,
  as = "input",
  className = "",
  value,
  options,
  children,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = useMemo(() => {
    if (value === undefined || value === null) return false;
    return String(value).trim().length > 0;
  }, [value]);

  const showLabel = focused || hasValue;
  const isTextarea = as === "textarea";
  const isSelect = as === "select";
  const baseClass = isTextarea
    ? `w-full min-h-24 px-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200 ${showLabel ? "pt-6 pb-3" : "py-3"}`
    : `w-full h-14 px-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200 ${showLabel ? "pt-5 pb-1" : "py-0"}`;

  const Element = as;
  const sharedProps = {
    ...props,
    value,
    onFocus: (e) => {
      setFocused(true);
      props.onFocus?.(e);
    },
    onBlur: (e) => {
      setFocused(false);
      props.onBlur?.(e);
    },
    className: `${baseClass} ${className}`.trim(),
  };

  return (
    <div className="relative">
      {isSelect ? (
        <Element {...sharedProps}>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {children}
        </Element>
      ) : isTextarea ? (
        <Element {...sharedProps}>{children}</Element>
      ) : (
        <Element {...sharedProps} />
      )}

      <span
        className={`absolute left-4 text-[11px] font-semibold text-[#16a34a] pointer-events-none transition-all duration-200 ${
          showLabel ? "top-1.5 opacity-100" : "top-3 opacity-0"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
