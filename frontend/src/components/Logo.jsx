export default function Logo({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="6" y="24" width="7" height="16" rx="1.5" fill="#2D6B9F" />
      <rect x="17" y="16" width="7" height="24" rx="1.5" fill="#2D6B9F" />
      <rect x="28" y="8" width="7" height="32" rx="1.5" fill="#2D6B9F" />
      <circle cx="37" cy="11" r="10" fill="#1D9E75" />
      <path
        d="M32.5 11.2l3 3 6-6.4"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
