interface StoneIconProps {
  size?: number;
  color?: string;
}

export function StoneIcon({ size = 24, color = "#78716c" }: StoneIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))'
      }}
    >
      {/* Pentagon stone shape with outline */}
      <polygon
        points="12,2 22,11 18,22 6,22 2,11"
        fill={color}
        stroke="rgba(0,0,0,0.4)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
