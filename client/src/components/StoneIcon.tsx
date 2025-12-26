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
    >
      {/* Pentagon stone shape with outline */}
      <polygon
        points="12,2 22,9 18,22 6,22 2,9"
        fill={color}
        stroke="#3a3a3a"
        strokeWidth="1.2"
      />
    </svg>
  );
}
