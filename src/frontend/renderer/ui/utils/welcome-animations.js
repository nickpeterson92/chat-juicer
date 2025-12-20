/**
 * Chat Juicer Welcome Animation System
 * Single-file implementation (~90 lines)
 *
 * Features:
 * - 4 animation variants (2 greeting × 2 pills = 4 combinations)
 * - 60fps GPU-accelerated animations
 * - ESC key skip handler
 * - Screen reader support (ARIA live regions)
 */

import { createTimeline, stagger } from "animejs";

// ============================================================================
// CONFIGURATION
// ============================================================================

const GREETING_VARIANTS = {
  fadeSlideUp: {
    duration: 500,
    easing: "easeOutCubic",
    opacity: [0, 1],
    translateY: [20, 0],
  },
  fadeScale: {
    duration: 500,
    easing: "easeOutBack",
    opacity: [0, 1],
    scale: [0.85, 1],
  },
};

const PILL_VARIANTS = {
  sequentialSlide: {
    duration: 400,
    easing: "easeOutCubic",
    opacity: [0, 1],
    translateX: [-30, 0],
    stagger: 80,
  },
  fadeRise: {
    duration: 400,
    easing: "easeOutQuad",
    opacity: [0, 1],
    translateY: [15, 0],
    stagger: 60,
  },
};

// ============================================================================
// ARIA LIVE REGION
// ============================================================================

function createAriaLiveRegion() {
  let announcer = document.getElementById("welcome-announcer");
  if (announcer) return announcer;

  announcer = document.createElement("div");
  announcer.id = "welcome-announcer";
  announcer.setAttribute("role", "status");
  announcer.setAttribute("aria-live", "polite");
  announcer.setAttribute("aria-atomic", "true");
  announcer.className = "sr-only";
  document.body.appendChild(announcer);
  return announcer;
}

function announceToScreenReader(message) {
  const announcer = createAriaLiveRegion();
  announcer.textContent = message;
}

// ============================================================================
// ANIMATION IMPLEMENTATION
// ============================================================================

function animateElements(elements) {
  const { greeting, pills } = elements;
  const timeline = createTimeline({ autoplay: false });

  // Select random variants
  const greetingKeys = Object.keys(GREETING_VARIANTS);
  const pillKeys = Object.keys(PILL_VARIANTS);
  const greetingVariant = GREETING_VARIANTS[greetingKeys[Math.floor(Math.random() * greetingKeys.length)]];
  const pillVariant = PILL_VARIANTS[pillKeys[Math.floor(Math.random() * pillKeys.length)]];

  // Remove pre-animate class to allow animation to take control
  pills.forEach((pill) => {
    pill.classList.remove("pills-pre-animate");
  });

  // Set initial states
  greeting.style.opacity = "0";
  pills.forEach((pill) => {
    pill.style.opacity = "0";
  });

  // Phase 1: Greeting animation
  timeline.add(greeting, {
    ...greetingVariant,
  });

  // Phase 2: 100ms pause
  timeline.add(greeting, {
    duration: 100,
    opacity: 1,
  });

  // Phase 3: Pills animation
  timeline.add(pills, {
    ...pillVariant,
    delay: pillVariant.stagger
      ? stagger(pillVariant.stagger, {
          from: pillVariant.from || "first",
        })
      : 0,
    onComplete: () => {
      announceToScreenReader("Welcome page ready. 5 suggestions available.");
      cleanupInlineStyles([greeting, ...pills]);
      document.getElementById("welcome-input")?.focus();
    },
  });

  return timeline;
}

// ============================================================================
// UTILITIES
// ============================================================================

function cleanupInlineStyles(elements) {
  const targets = Array.isArray(elements) ? elements : [elements];
  targets.forEach((el) => {
    if (el?.style) {
      el.style.cssText = "";
    }
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function animateWelcomeScreen(elements) {
  // Setup ESC key handler
  const escHandler = (e) => {
    if (e.key === "Escape") {
      if (timeline) {
        timeline.seek(timeline.duration);
        timeline.pause();
      }
      // Remove pre-animate class and clean up inline styles
      elements.pills.forEach((pill) => {
        pill.classList.remove("pills-pre-animate");
      });
      cleanupInlineStyles([elements.greeting, ...elements.pills]);
      announceToScreenReader("Animation skipped. Welcome page ready.");
      document.getElementById("welcome-input")?.focus();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);

  // Run animation
  const timeline = animateElements(elements);
  timeline.play();

  // Return cleanup function
  return () => {
    document.removeEventListener("keydown", escHandler);
    if (timeline) {
      timeline.pause();
    }
    cleanupInlineStyles([elements.greeting, ...elements.pills]);
  };
}
