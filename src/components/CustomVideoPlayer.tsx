import React, { useRef, useState, useEffect } from "react";

const CustomVideoPlayer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Set up intersection observer to detect when video is scrolled out of view
    const options = {
      root: null, // viewport
      rootMargin: "0px",
      threshold: 0.3, // trigger when 30% of the element is visible
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        // When scrolled out of view and video is playing, reset to original state
        if (!entry.isIntersecting && isPlaying) {
          if (videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
            setIsExpanded(false);
          }
        }
      });
    }, options);

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [isPlaying]);

  const handlePlay = () => {
    if (videoRef.current) {
      setIsExpanded(true);
      // Small delay to allow animation to complete before playing
      setTimeout(() => {
      videoRef.current.play();
      setIsPlaying(true);
      }, 300);
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full transition-all duration-500 ease-in-out ${
        isExpanded ? "max-w-4xl scale-105" : "max-w-3xl scale-100"
      } aspect-video mx-auto flex items-center justify-center bg-gradient-to-b from-gray-900 via-neutral-900 to-black rounded-3xl shadow-2xl border-2 border-dashed border-gray-700 overflow-hidden glow-border`}
    >
      {!isPlaying && (
        <button
          onClick={handlePlay}
          className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-20 h-20 rounded-full bg-gray-700/80 shadow-lg border-4 border-white/70 hover:bg-gray-700/90 hover:border-white/90 hover:scale-105 transition-all duration-300 focus:outline-none"
          aria-label="Play video"
        >
          <svg
            className="w-10 h-10 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <polygon points="9.5,7.5 16.5,12 9.5,16.5" />
          </svg>
        </button>
      )}
      {isPlaying && (
        <button
          onClick={handlePause}
          className="absolute z-10 right-4 top-4 flex items-center justify-center w-10 h-10 rounded-full bg-white/80 shadow-md hover:scale-105 transition-transform duration-300 focus:outline-none"
          aria-label="Pause video"
        >
          <svg
            className="w-6 h-6 text-gray-800"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="6" y="5" width="4" height="14" />
            <rect x="14" y="5" width="4" height="14" />
          </svg>
        </button>
      )}
      <video
        ref={videoRef}
        className={`w-full h-full object-cover rounded-2xl transition-opacity duration-300 ${
          isPlaying ? "opacity-100" : "opacity-90"
        }`}
        playsInline
        preload="metadata"
        src="/devlabs-website/main-video.mp4"
        poster="/devlabs-website/cover-image.jpg"
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onEnded={() => {
          setIsPlaying(false);
          setIsExpanded(false);
        }}
      >
        <source src="/devlabs-website/main-video.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default CustomVideoPlayer;
