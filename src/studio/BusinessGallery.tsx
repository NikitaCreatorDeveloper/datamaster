import { useState } from "react";
import {
  ShoppingBag,
  Boxes,
  UsersRound,
  ChartNoAxesCombined,
  Wallet,
  GitMerge,
  PlugZap,
  Files,
  Play,
  LoaderCircle,
  ChevronRight,
} from "lucide-react";
import { businessSamples } from "../businessSamples";
import type { T } from "../ui";
const icons = [
  ShoppingBag,
  Boxes,
  UsersRound,
  ChartNoAxesCombined,
  Wallet,
  GitMerge,
  PlugZap,
  Files,
];
const hues = [
  "violet",
  "blue",
  "aqua",
  "apricot",
  "aqua",
  "apricot",
  "violet",
  "blue",
];
export function BusinessGallery({
  t,
  launch,
  compact = false,
}: {
  t: T;
  launch: (id: string) => Promise<void>;
  compact?: boolean;
}) {
  const [all, All] = useState(!compact),
    [busy, B] = useState("");
  return (
    <section className="businessgallery">
      <div className="sectionhead">
        <div>
          <h2>{t("Бизнес-шаблоны", "Business templates")}</h2>
          <p>
            {t(
              "Запуск на демонстрационных данных",
              "Run with sample business data",
            )}
          </p>
        </div>
        {compact && (
          <button className="textlink" onClick={() => All(!all)}>
            {all
              ? t("Свернуть", "Show fewer")
              : t("Все 8 шаблонов", "All 8 templates")}
            <ChevronRight size={14} />
          </button>
        )}
      </div>
      <div className="businessgrid">
        {businessSamples.slice(0, all ? 8 : 4).map((s, i) => {
          const Icon = icons[i];
          return (
            <button
              disabled={!!busy}
              key={s.id}
              data-sample={s.id}
              className={"businesscard palette-" + hues[i]}
              onClick={async () => {
                B(s.id);
                try {
                  await launch(s.id);
                } finally {
                  B("");
                }
              }}
            >
              <div className="businesscard-art">
                <div className="sample-lines" />
                <div className="sample-icon">
                  <Icon size={25} />
                </div>
                <span>
                  {busy === s.id ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : (
                    <Play size={12} />
                  )}
                </span>
              </div>
              <div>
                <h3>{t(...s.title)}</h3>
                <p>{t(...s.description)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
