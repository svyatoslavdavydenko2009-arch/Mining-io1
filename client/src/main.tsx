import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Store reference to root element for height updates
let rootElement: HTMLElement | null = null;

// Real-time viewport height tracking with requestAnimationFrame for instant response
const updateViewportHeight = () => {
  const height = window.visualViewport?.height ?? window.innerHeight;
  
  // Update CSS variable on document
  document.documentElement.style.setProperty('--visual-vh', `${height}px`);
  
  // Also update root element directly if available
  if (rootElement) {
    rootElement.style.height = `${height}px`;
  }
};

// Continuous monitoring with RAF for instant response
let rafId: number | null = null;
const startMonitoring = () => {
  const monitor = () => {
    updateViewportHeight();
    rafId = requestAnimationFrame(monitor);
  };
  monitor();
};

// Update on resize
window.addEventListener('resize', updateViewportHeight, { passive: true });

// Also listen to visualViewport changes
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateViewportHeight, { passive: true });
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

// Initial update
updateViewportHeight();

// Create app
const container = document.getElementById("root")!;
rootElement = container;
createRoot(container).render(<App />);

// Start continuous monitoring
startMonitoring();
