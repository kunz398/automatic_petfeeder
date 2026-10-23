// Knight: a sitting black cat with yellow eyes
export default function CatIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      {/* tail */}
      <path d="M44 56c9 0 14-5 13-12-1-5-6-6-7-2" fill="none" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
      {/* body */}
      <path d="M18 58c-3-10 0-21 9-26h10c9 5 12 16 9 26z" fill="#141414" />
      {/* head with ears */}
      <path d="M17 10l7 9h16l7-9 2 17c0 9-7 15-17 15S15 36 15 27z" fill="#141414" />
      {/* eyes */}
      <ellipse cx="25.5" cy="27" rx="3.4" ry="3.8" fill="#f7d34a" />
      <ellipse cx="38.5" cy="27" rx="3.4" ry="3.8" fill="#f7d34a" />
      <ellipse cx="25.5" cy="27" rx="1.1" ry="2.9" fill="#141414" />
      <ellipse cx="38.5" cy="27" rx="1.1" ry="2.9" fill="#141414" />
      {/* nose */}
      <path d="M30.5 33h3l-1.5 1.8z" fill="#e98aa0" />
    </svg>
  );
}
