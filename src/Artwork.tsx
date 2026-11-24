/** Isometric data stack with three independently drawn grid planes. */
export function Artwork() {
  const iso = (u: number, v: number, z: number) => [
    246 + u * 1.02 - v * 0.97,
    75 + u * 0.4 + v * 0.48 - z,
  ];
  const pts = (arr: number[][]) =>
    arr.map((a) => iso(a[0], a[1], a[2]).join(",")).join(" ");
  const plane = (
    level: number,
    top: string,
    front: string,
    side: string,
    grid: boolean,
  ) => (
    <g key={level}>
      <polygon
        points={pts([
          [0, 0, level],
          [112, 0, level],
          [112, 95, level],
          [0, 95, level],
        ])}
        fill={top}
        stroke="#d3caff"
        strokeWidth="1"
      />
      <polygon
        points={pts([
          [0, 95, level],
          [112, 95, level],
          [112, 95, level - 10],
          [0, 95, level - 10],
        ])}
        fill={front}
        stroke="#a295f7"
        strokeWidth=".8"
      />
      <polygon
        points={pts([
          [112, 0, level],
          [112, 95, level],
          [112, 95, level - 10],
          [112, 0, level - 10],
        ])}
        fill={side}
        stroke="#9b93f5"
        strokeWidth=".8"
      />
      {grid &&
        [1, 2, 3, 4, 5].map((i) => (
          <g key={i} stroke="#d6caff" strokeOpacity=".7" strokeWidth=".75">
            <polyline
              points={pts([
                [i * 18.7, 0, level],
                [i * 18.7, 95, level],
              ])}
            />
            <polyline
              points={pts([
                [0, i * 15.84, level],
                [112, i * 15.84, level],
              ])}
            />
          </g>
        ))}
      {level === 15 &&
        [12, 20, 28].map((v, i) => (
          <circle
            key={v}
            cx={iso(v, 95, level - 5)[0]}
            cy={iso(v, 95, level - 5)[1]}
            r="1.6"
            fill={i === 0 ? "#b0fff1" : "#c4b6ff"}
          />
        ))}
    </g>
  );
  return (
    <svg
      className="hero-art"
      viewBox="0 0 480 218"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="plate" x2=".9" y2="1">
          <stop stopColor="#549aff" />
          <stop offset=".45" stopColor="#8e8bff" />
          <stop offset="1" stopColor="#b29aff" />
        </linearGradient>
        <linearGradient id="chip">
          <stop stopColor="#9e87f5" />
          <stop offset="1" stopColor="#5a69ee" />
        </linearGradient>
        <filter id="blur">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g stroke="#aca0ff" opacity=".53" strokeWidth="1">
        <path d="m18 168 53-27 38 15 53-28m-88 57 49-27 25 10 25-13M47 93l41-18 63 25 31-15m117 85 28 13 42-19 28 11 62-29m-117-39 29 13 27-15 43 16 32-13M320 63l40-21 21 9 51-23M288 48l34-17 23 8 20-11" />
        <path
          strokeDasharray="3 4"
          d="m65 119 32-15 40 17 27-13m131 82 36 17 47-23"
        />
      </g>
      <g fill="#ad9aff">
        {[
          [18, 168],
          [74, 185],
          [47, 93],
          [459, 146],
          [473, 108],
          [432, 28],
          [365, 28],
          [65, 119],
          [378, 184],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="2.8" />
        ))}
      </g>
      <ellipse
        cx="249"
        cy="165"
        rx="82"
        ry="16"
        fill="#38278e"
        opacity=".55"
        filter="url(#blur)"
      />
      {plane(-20, "#575bd4", "#5144b0", "#373899", true)}
      {plane(-3, "#9b9bff", "#7968d9", "#5956cd", true)}
      {plane(15, "url(#plate)", "#9688ee", "#6e66d7", true)}
      {[
        { u: 24, v: 48, h: 18 },
        { u: 45, v: 42, h: 33 },
        { u: 66, v: 36, h: 50 },
      ].map(({ u, v, h }) => (
        <g key={u}>
          <polygon
            points={pts([
              [u, v, 15 + h],
              [u + 13, v, 15 + h],
              [u + 13, v + 15, 15 + h],
              [u, v + 15, 15 + h],
            ])}
            fill="#fcfaff"
            stroke="#f1eaff"
          />
          <polygon
            points={pts([
              [u, v + 15, 15 + h],
              [u + 13, v + 15, 15 + h],
              [u + 13, v + 15, 15],
              [u, v + 15, 15],
            ])}
            fill="#ddd7ff"
          />
          <polygon
            points={pts([
              [u + 13, v, 15 + h],
              [u + 13, v + 15, 15 + h],
              [u + 13, v + 15, 15],
              [u + 13, v, 15],
            ])}
            fill="#a89bf0"
          />
        </g>
      ))}
      <g
        fontFamily="monospace"
        fontSize="11"
        fontWeight="600"
        letterSpacing="1"
      >
        <g transform="translate(89 49) rotate(-8)">
          <rect width="50" height="24" rx="6" fill="#7165ce" stroke="#aea1f6" />
          <text x="10" y="16" fill="white">
            XLSX
          </text>
        </g>
        <g transform="translate(363 75) rotate(7)">
          <rect width="50" height="24" rx="6" fill="#7667cf" stroke="#b1a4f6" />
          <text x="9" y="16" fill="white">
            JSON
          </text>
        </g>
        <g transform="translate(110 174) rotate(-7)">
          <rect width="41" height="22" rx="5" fill="#645ec2" stroke="#a294ec" />
          <text x="9" y="15" fill="white">
            CSV
          </text>
        </g>
      </g>
    </svg>
  );
}
