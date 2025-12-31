import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Fix for mobile keyboard shifting content
(function() {
  let initialHeight = window.innerHeight;
  let offsetY = 0;
  
  // Aggressively prevent any viewport changes
  const compensateViewport = () => {
    const currentHeight = window.innerHeight;
    const heightDiff = initialHeight - currentHeight;
    
    if (heightDiff > 50) {
      // Keyboard is open or view changed significantly
      // When keyboard opens, content shifts UP, so we shift it back DOWN by applying negative offset
      offsetY = -heightDiff;
      document.documentElement.style.transform = `translateY(${offsetY}px)`;
    } else {
      // Keyboard closed, reset
      offsetY = 0;
      document.documentElement.style.transform = 'translateY(0)';
    }
    
    // Always ensure at top
    window.scrollTo(0, 0);
  };
  
  // Listen to every possible change event
  window.addEventListener('resize', compensateViewport);
  window.addEventListener('scroll', () => window.scrollTo(0, 0));
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      initialHeight = window.innerHeight;
      compensateViewport();
    }, 200);
  });
  
  // Visual viewport changes (mobile specific)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', compensateViewport);
  }
  
  // Aggressive scroll prevention
  let lastY = 0;
  document.addEventListener('touchmove', (e) => {
    if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
      e.preventDefault();
      window.scrollTo(0, lastY);
    }
  }, { passive: false });
  
  document.addEventListener('wheel', (e) => {
    if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
      e.preventDefault();
      window.scrollTo(0, lastY);
    }
  }, { passive: false });
  
  document.addEventListener('scroll', (e) => {
    lastY = window.scrollY;
  }, { passive: true });
  
  // Initial compensation
  setTimeout(compensateViewport, 100);
})();

createRoot(document.getElementById("root")!).render(<App />);
