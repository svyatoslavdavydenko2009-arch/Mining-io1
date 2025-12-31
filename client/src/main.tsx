import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Real-time viewport height tracking for instant keyboard response
const updateViewportHeight = () => {
  // Use visualViewport if available (most accurate for mobile)
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--visual-vh', `${height}px`);
};

// Update on resize (catches keyboard appearance/disappearance)
window.addEventListener('resize', updateViewportHeight);

// Also listen to visualViewport changes for faster response on supported browsers
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateViewportHeight);
}

// Initial update
updateViewportHeight();

// Prevent any scrolling
document.addEventListener('touchmove', (e) => {
  if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault();
  }
}, { passive: false });

window.addEventListener('scroll', () => {
  window.scrollTo(0, 0);
});

createRoot(document.getElementById("root")!).render(<App />);
