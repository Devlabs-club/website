import React from "react";

interface Props {
  size: string;
  className?: string;
  children: React.ReactNode;
}

export const WrappedText: React.FC<Props> = ({
  size,
  className = "",
  children,
}) => {
  if (size === "large") {
    return (
      <span
        className={`text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl w-full font-normal p-2 sm:p-3 border border-dashed bg-black/80 backdrop-blur-sm opacity-90 ${className}`}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      className={`text-xs sm:text-sm md:text-base w-max font-semibold p-1 sm:p-2 bg-gradient-to-r from-orange-500 to-orange-300 text-black ${className}`}
    >
      {children}
    </span>
  );
};
