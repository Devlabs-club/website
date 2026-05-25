/**
 * Events Parallax scroll effect
 * - Text stage stays fixed in center during scroll
 * - Image stage stays fixed at bottom during scroll
 * - Text lines animate sequentially based on scroll progress
 */
export function initEventsParallax() {
  const section = document.querySelector("[data-events-parallax]");
  const textStage = document.querySelector("[data-events-parallax-text]");
  const imageStage = document.querySelector("[data-events-parallax-image]");
  const glow = document.querySelector("[data-events-parallax-glow]");
  const lines = document.querySelectorAll("[data-events-parallax-line]");

  if (!section || !textStage || !imageStage) return;

  // Frozen scroll coordinates
  let start = null;
  let end = null;
  let segmentEnd = null;

  function getFixedBottomOffset(el) {
    const rect = el.getBoundingClientRect();
    return window.innerHeight - rect.bottom;
  }

  function onScroll() {
    const vh = window.innerHeight;
    const y = window.scrollY;

    // Freeze reference frame once
    if (start === null) {
      const rect = section.getBoundingClientRect();
      const sectionStart = rect.top + y;
      const height = section.offsetHeight;
      const holdPx = vh; // hold last line for one viewport

      start = sectionStart;
      end = sectionStart + height - vh;
      segmentEnd = sectionStart + height - vh - holdPx;
    }

    /* ======================
       GLOW (fixed eclipse, only visible while section is in view)
       ====================== */
    if (glow) {
      if (y >= start && y < end) {
        glow.classList.add("is-visible");
      } else {
        glow.classList.remove("is-visible");
      }
    }

    /* ======================
       TEXT STAGE (centered)
       ====================== */
    if (y < start) {
      textStage.style.position = "absolute";
      textStage.style.top = "0";
      textStage.style.bottom = "";
    } else if (y >= end) {
      textStage.style.position = "absolute";
      textStage.style.top = "";
      textStage.style.bottom = "0";
    } else {
      textStage.style.position = "fixed";
      textStage.style.top = "0";
      textStage.style.bottom = "";
    }

    /* ======================
       IMAGE STAGE (bottom)
       Animates from bottom to top - completes early with first text
       ====================== */
    // Image completes animation in the first 20% of scroll (when first text appears)
    const imageScrollRange = (end - start) * 0.2; // Complete in first 20%
    const imageProgress = Math.min(1, Math.max(0, (y - start) / imageScrollRange));
    
    // Start with image 30% below viewport, animate to 0 (fully visible)
    const imageOffset = (1 - imageProgress) * 30; // percentage to translate down
    
    if (y < start) {
      // Before section: image hidden below
      imageStage.style.position = "absolute";
      imageStage.style.bottom = "0";
      imageStage.style.transform = "translateY(30%)";
      imageStage.style.transition = "none";
    } else if (y >= end) {
      // After section: image fully visible, anchored
      imageStage.style.position = "absolute";
      imageStage.style.bottom = "0";
      imageStage.style.transform = "translateY(0)";
      imageStage.style.transition = "none";
    } else {
      // During scroll: fixed position, animating upward
      imageStage.style.position = "fixed";
      imageStage.style.bottom = "0";
      imageStage.style.transform = `translateY(${imageOffset}%)`;
      imageStage.style.transition = "none"; // smooth scroll handles the animation
    }

    /* ======================
       Segment-based text with smooth fade
       ====================== */
    const progress = Math.min(
      1,
      Math.max(0, (y - start) / (segmentEnd - start))
    );

    const lineCount = lines.length;
    // Use continuous progress for smoother transitions
    const continuousIndex = progress * lineCount;
    const activeIndex = Math.min(lineCount - 1, Math.floor(continuousIndex));
    
    // How far into the current segment (0 to 1)
    const segmentProgress = continuousIndex - activeIndex;

    lines.forEach((line, i) => {
      // Calculate vertical offset - lines move up as they become "past"
      // Active line starts at 0, previous lines move up, future lines are below
      let offset;
      let opacity;
      
      if (i < activeIndex) {
        // Past lines: move up into the fade zone
        const linesAway = activeIndex - i;
        offset = -(linesAway * 120 + segmentProgress * 120); // Move up with scroll
        // Fade out based on distance (CSS mask handles most of this)
        opacity = Math.max(0, 1 - (linesAway * 0.4 + segmentProgress * 0.4));
      } else if (i === activeIndex) {
        // Current line: moves up slightly as next line comes in
        offset = -(segmentProgress * 120);
        opacity = 1;
      } else {
        // Future lines: below and hidden, slide up when becoming active
        const linesAway = i - activeIndex;
        offset = (linesAway - segmentProgress) * 60 + 40; // Start below, slide up
        opacity = i === activeIndex + 1 ? segmentProgress : 0;
      }
      
      line.style.transform = `translateY(${offset}px)`;
      line.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    });
  }

  function onResize() {
    start = null;
    end = null;
    segmentEnd = null;
    onScroll();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  onScroll();

  // Cleanup function (if needed for SPA navigation)
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
  };
}

/**
 * Global section parallax: reveal on scroll + optional depth-based movement.
 * - Sections with [data-parallax-section] fade/slide in when entering viewport.
 * - Optional [data-parallax-depth] (0–1) adds scroll-linked translateY for depth.
 */
export function initSectionParallax() {
  const sections = document.querySelectorAll("[data-parallax-section]");
  if (!sections.length) return;

  const vh = window.innerHeight;
  const revealMargin = Math.min(vh * 0.15, 120);
  const revealRootMargin = `0px 0px -${revealMargin}px 0px`;

  // Reveal: Intersection Observer adds .parallax-revealed when section is in view
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("parallax-revealed");
        }
      });
    },
    {
      root: null,
      rootMargin: revealRootMargin,
      threshold: 0,
    }
  );

  function isInView(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight - revealMargin;
  }

  sections.forEach((el) => {
    el.classList.add("parallax-section");
    if (isInView(el)) el.classList.add("parallax-revealed");
    revealObserver.observe(el);
  });

  // Depth: scroll-linked translateY for sections with data-parallax-depth
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      sections.forEach((el) => {
        const depth = parseFloat(el.getAttribute("data-parallax-depth") || "0");
        if (depth === 0) return;
        const rect = el.getBoundingClientRect();
        const sectionCenter = rect.top + rect.height / 2;
        const viewportCenter = vh / 2;
        const offsetFromCenter = sectionCenter - viewportCenter;
        const parallaxOffset = offsetFromCenter * depth * 0.15;
        el.style.setProperty("--parallax-offset-y", `${parallaxOffset}px`);
      });
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    onScroll();
  });
  onScroll();

  return () => {
    revealObserver.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}
