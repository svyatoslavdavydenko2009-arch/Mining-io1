import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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
