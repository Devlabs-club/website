import React, { useRef, forwardRef } from 'react';
import { toPng } from 'html-to-image';

export interface MomentumPosterProps {
  participantName: string;
  startupName: string;
  imageSrc: string;
  className?: string;
  showDownloadBtn?: boolean;
}

export const MomentumPoster = forwardRef<HTMLDivElement, MomentumPosterProps>(
  ({ participantName, startupName, imageSrc, className = '', showDownloadBtn = true }, externalRef) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const posterRef = (externalRef as React.RefObject<HTMLDivElement>) || internalRef;

    const handleDownload = async () => {
      if (!posterRef.current) return;
      
      try {
        const dataUrl = await toPng(posterRef.current, {
          quality: 1.0,
          pixelRatio: 3, // High-res export for crisp text
        });
        
        const link = document.createElement('a');
        link.download = `momentum-${participantName.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error('Failed to generate image', err);
      }
    };

    return (
      <div className={`flex flex-col gap-4 ${className}`}>
        {/* 
          The @container class is crucial here. It allows us to use 'cqw' (container query width)
          units for the font sizes. This means the text will scale perfectly proportionally 
          whether the poster is rendered at 200px wide or 1000px wide.
        */}
        <div 
          ref={posterRef}
          className="relative w-full aspect-[2/3] @container overflow-hidden rounded-md shadow-lg bg-[#EAE5D9]" // Matching the poster's background color
        >
          {/* Base Poster Image */}
          <img 
            src={imageSrc} 
            alt={`Momentum poster for ${participantName}`}
            className="absolute inset-0 w-full h-full object-cover"
            crossOrigin="anonymous"
          />

          {/* 
            Overlaid Text Container
            Positioned perfectly over the blank space in the bottom left.
          */}
          <div 
            className="absolute flex flex-col justify-start"
            style={{ 
              top: '71%',    // Moved up to give more room for wrapping names
              left: '10.5%', // Matches the left alignment
              width: '78%'   // Increased width so long names wrap safely over the watermark if needed
            }}
          >
            {/* Participant Name */}
            <h2 
              className="font-seasons text-[#1a1a1a] leading-[1.05] tracking-tight"
              style={{ 
                fontSize: '11cqw', // 11% of the container width
                marginBottom: '1.5cqw' 
              }} 
            >
              {participantName}
            </h2>
            
            {/* Startup Name */}
            <p 
              className="font-sans text-[#333333] leading-tight"
              style={{ 
                fontSize: '4.2cqw', 
                letterSpacing: '-0.01em' 
              }} 
            >
              {startupName}
            </p>
          </div>
        </div>

        {showDownloadBtn && (
          <button
            onClick={handleDownload}
            className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-md font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Badge
          </button>
        )}
      </div>
    );
  }
);

MomentumPoster.displayName = 'MomentumPoster';
