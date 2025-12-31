import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Use visualViewport API for real-time keyboard detection and adjustment
if (window.visualViewport) {
  const updateViewportHeight = () => {
    const vh = window.visualViewport!.height;
    document.documentElement.style.setProperty('--visual-vh', `${vh}px`);
  };
  
  window.visualViewport.addEventListener('resize', updateViewportHeight);
  updateViewportHeight();
}

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
