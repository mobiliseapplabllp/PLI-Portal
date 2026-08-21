/**
 * Lakshya mark — "lakshya" (लक्ष्य) means target/goal, so the logo is an arrow
 * striking the bullseye. Uses currentColor throughout, so it takes the colour of
 * whatever it sits in (white on the sidebar/brand panel, primary on light cards).
 */
export default function LakshyaLogo({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* target rings */}
      <circle cx="13.5" cy="18.5" r="11" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <circle cx="13.5" cy="18.5" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.65" />
      <circle cx="13.5" cy="18.5" r="2.1" fill="currentColor" />
      {/* arrow shaft + head */}
      <path d="M13.5 18.5 L28 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M21.5 4 L28 4 L28 10.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
