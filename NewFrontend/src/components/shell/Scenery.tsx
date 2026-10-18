// Decorative agricultural scenery drawn as SVG (no screenshot crops, no external images).
// Both scenes are aria-hidden; they carry no information.

/** Header banner: sky, sun, distant hills, tree line and crop rows. Anchored to the right edge. */
export function HeaderLandscape() {
  return (
    <div className="km-header-art" aria-hidden="true">
      <svg viewBox="0 0 1323 80" preserveAspectRatio="xMaxYMax slice">
        <defs>
          <linearGradient id="hl-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6f7ea" />
            <stop offset="0.7" stopColor="#eef4e2" />
            <stop offset="1" stopColor="#e3eed3" />
          </linearGradient>
          <radialGradient id="hl-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe066" />
            <stop offset="0.45" stopColor="#ffd84a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff3b8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hl-field" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b9d58a" />
            <stop offset="1" stopColor="#8fbf5c" />
          </linearGradient>
          <linearGradient id="hl-mustard" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e9d96a" />
            <stop offset="1" stopColor="#c9c24a" />
          </linearGradient>
        </defs>
        <rect width="1323" height="80" fill="url(#hl-sky)" />
        <circle cx="630" cy="25" r="24" fill="url(#hl-sun)" />
        <circle cx="630" cy="25" r="7.5" fill="#ffd23f" />
        {/* distant hills */}
        <path d="M380 54c60-14 120-18 190-10s130 6 200-6 150-14 230-4 160 10 323-2v48H380Z" fill="#cfe0bd" opacity="0.8" />
        <path d="M460 60c70-10 150-12 220-4s140 8 220-2 170-10 250-2 110 6 173 0v28H460Z" fill="#bdd6a6" opacity="0.85" />
        {/* tree line */}
        <g fill="#7fae63">
          {[520, 548, 590, 742, 776, 812, 960, 1004, 1048, 1172, 1210, 1262, 1300].map((x, i) => (
            <g key={x}>
              <rect x={x - 1} y={50 - (i % 3)} width="2" height="8" fill="#6a8a4c" />
              <ellipse cx={x} cy={48 - (i % 3) * 2} rx={9 + (i % 2) * 3} ry={8 + (i % 3)} />
            </g>
          ))}
        </g>
        <g fill="#5f9548" opacity="0.9">
          <ellipse cx="548" cy="44" rx="7" ry="6" />
          <ellipse cx="1004" cy="44" rx="7" ry="6" />
          <ellipse cx="1262" cy="44" rx="8" ry="6" />
        </g>
        {/* crop rows */}
        <path d="M300 66c180-6 400-8 600-4s300 4 423 0v18H300Z" fill="url(#hl-mustard)" opacity="0.9" />
        <path d="M300 71c200-4 420-5 620-2s280 3 403 0v12H300Z" fill="url(#hl-field)" />
        <g stroke="#7aa94e" strokeWidth="1" opacity="0.6">
          {Array.from({ length: 40 }).map((_, i) => (
            <path key={i} d={`M${330 + i * 25} 80l${-6 + (i % 3) * 2} -8`} />
          ))}
        </g>
        <g fill="#f3e27a" opacity="0.85">
          {Array.from({ length: 34 }).map((_, i) => (
            <circle key={i} cx={360 + i * 28 + (i % 4) * 3} cy={67 + (i % 3)} r="1.6" />
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Lower-sidebar farm illustration: trees, layered fields, a small tractor. */
export function FarmScene() {
  return (
    <div className="km-farm-scene" aria-hidden="true">
      <svg viewBox="0 0 263 178" preserveAspectRatio="xMidYMax slice" width="100%" height="100%">
        <defs>
          <linearGradient id="fs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbfdfb" stopOpacity="0" />
            <stop offset="0.35" stopColor="#f1f6ea" />
            <stop offset="1" stopColor="#e8f0dc" />
          </linearGradient>
          <linearGradient id="fs-hill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c6ddb0" />
            <stop offset="1" stopColor="#a8cb8d" />
          </linearGradient>
          <linearGradient id="fs-row-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9cc66c" />
            <stop offset="1" stopColor="#6aa443" />
          </linearGradient>
          <linearGradient id="fs-row-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9cf63" />
            <stop offset="1" stopColor="#bcb349" />
          </linearGradient>
          <linearGradient id="fs-row-c" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7fb456" />
            <stop offset="1" stopColor="#4f8f35" />
          </linearGradient>
        </defs>
        <rect width="263" height="178" fill="url(#fs-sky)" />
        <path d="M0 74c30-12 62-16 96-8 30 7 58 6 88-4 28-9 56-8 79-2v60H0Z" fill="url(#fs-hill)" />
        {/* trees */}
        <g>
          <rect x="31" y="60" width="3" height="26" fill="#6b5a3b" />
          <ellipse cx="32" cy="52" rx="19" ry="17" fill="#6fa34d" />
          <ellipse cx="25" cy="47" rx="10" ry="9" fill="#82b65c" />
          <rect x="70" y="68" width="2.5" height="18" fill="#6b5a3b" />
          <ellipse cx="71" cy="63" rx="12" ry="11" fill="#78ab53" />
          <rect x="214" y="58" width="3" height="28" fill="#6b5a3b" />
          <ellipse cx="215" cy="50" rx="20" ry="18" fill="#679c46" />
          <ellipse cx="222" cy="45" rx="10" ry="9" fill="#7fb25a" />
          <rect x="246" y="66" width="2.5" height="20" fill="#6b5a3b" />
          <ellipse cx="247" cy="61" rx="11" ry="10" fill="#75a951" />
          <ellipse cx="150" cy="74" rx="9" ry="7" fill="#8bbb66" />
          <ellipse cx="118" cy="76" rx="7" ry="5.5" fill="#8bbb66" />
        </g>
        {/* layered fields */}
        <path d="M0 92c50-8 110-10 170-6 40 3 70 3 93 0v20H0Z" fill="url(#fs-row-b)" />
        <path d="M0 104c60-6 130-7 190-3 30 2 52 2 73 0v22H0Z" fill="url(#fs-row-a)" />
        <path d="M0 120c70-5 140-5 200-1 25 1 45 1 63 0v58H0Z" fill="url(#fs-row-c)" />
        <g stroke="#3f7d2e" strokeWidth="1.1" opacity="0.45" fill="none">
          {Array.from({ length: 12 }).map((_, i) => (
            <path key={i} d={`M${i * 24 - 10} 178C${i * 24 + 4} 150 ${i * 22 + 30} 132 ${i * 20 + 50} 122`} />
          ))}
        </g>
        <g fill="#f2e27c" opacity="0.8">
          {Array.from({ length: 16 }).map((_, i) => (
            <circle key={i} cx={8 + i * 16} cy={96 + (i % 3)} r="1.4" />
          ))}
        </g>
        {/* tractor */}
        <g transform="translate(108 108)">
          <rect x="0" y="6" width="24" height="10" rx="2" fill="#d9472b" />
          <rect x="11" y="-3" width="11" height="10" rx="1.5" fill="#e65c3c" />
          <rect x="13" y="-1" width="7" height="5" rx="1" fill="#d6ecf5" />
          <rect x="2" y="1" width="2" height="6" fill="#4b4b4b" />
          <circle cx="18" cy="17" r="6" fill="#2f2f2f" />
          <circle cx="18" cy="17" r="2.4" fill="#cfcfcf" />
          <circle cx="4.5" cy="18" r="3.8" fill="#2f2f2f" />
          <circle cx="4.5" cy="18" r="1.5" fill="#cfcfcf" />
        </g>
      </svg>
    </div>
  );
}
