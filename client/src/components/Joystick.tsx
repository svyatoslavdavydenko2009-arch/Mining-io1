import { useRef, useState } from "react";

interface JoystickProps {
  onMove: (dx: number, dy: number) => void;
  onEnd: () => void;
}

export function Joystick({ onMove, onEnd }: JoystickProps) {
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const radius = 40;

  const updatePosition = (clientX: number, clientY: number) => {
    const dx = clientX - centerRef.current.x;
    const dy = clientY - centerRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const limitedDist = Math.min(distance, radius);
    const angle = Math.atan2(dy, dx);
    
    const nx = Math.cos(angle) * limitedDist;
    const ny = Math.sin(angle) * limitedDist;
    
    setKnobPos({ x: nx, y: ny });
    onMove(nx / radius, ny / radius);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!baseRef.current) return;
    
    const rect = baseRef.current.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    
    baseRef.current.setPointerCapture(e.pointerId);
    updatePosition(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!baseRef.current) return;
    
    // Only update if this element has captured the pointer
    if (baseRef.current.hasPointerCapture && baseRef.current.hasPointerCapture(e.pointerId)) {
      updatePosition(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!baseRef.current) return;
    
    try {
      baseRef.current.releasePointerCapture(e.pointerId);
    } catch (e) {
      // Already released
    }
    
    setKnobPos({ x: 0, y: 0 });
    onMove(0, 0);
    onEnd();
  };

  return (
    <div 
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="w-24 h-24 bg-black/40 rounded-full border-4 border-[#3d2b1f] flex items-center justify-center pointer-events-auto touch-none select-none shadow-[0_0_15px_rgba(0,0,0,0.5)]"
    >
      <div className="absolute inset-0 rounded-full border-2 border-white/5 pointer-events-none" />
      <div 
        className="w-12 h-12 bg-[#fbbf24] rounded-full border-4 border-[#b45309] shadow-[inset_-4px_-4px_0_rgba(0,0,0,0.2)] flex items-center justify-center pointer-events-none"
        style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
      >
        <div className="w-6 h-6 border-2 border-[#b45309]/30 rounded-full" />
      </div>
    </div>
  );
}
