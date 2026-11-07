import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";

/**
 * CSS-анимация «змейка»: круги пульсируют по очереди от внешнего к центру,
 * затем знак делает самый сильный «выпрыгивающий» пульс с цветными тенями.
 * Стили объявлены рядом с компонентом, чтобы прелоадер не зависел от
 * порядка загрузки глобальных css. При prefers-reduced-motion анимация выключается.
 */
const ANIMATION_STYLES = `
.mzc-anim-layer { transform-box: fill-box; transform-origin: 51.25px 51.35px; }
.mzc-anim-circle-outer { animation: mzcPulseSnake 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 0s; }
.mzc-anim-circle-mid { animation: mzcPulseSnake 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 0.22s; }
.mzc-anim-circle-inner { animation: mzcPulseSnake 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 0.44s; }
.mzc-anim-logo-group { animation: mzcPulseLogo 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 0.66s; }
@keyframes mzcPulseSnake {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(0, 180, 255, 0)); }
  18% { transform: scale(0.92); filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4)); }
  36% { transform: scale(1.12); filter: drop-shadow(0 8px 18px rgba(0, 140, 255, 0.55)) drop-shadow(0 0 12px rgba(0, 180, 255, 0.35)); }
  54% { transform: scale(0.96); filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.35)); }
  72% { transform: scale(1.06); filter: drop-shadow(0 5px 12px rgba(0, 120, 220, 0.4)); }
}
@keyframes mzcPulseLogo {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(255, 180, 50, 0)); }
  18% { transform: scale(0.90); filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5)); }
  36% { transform: scale(1.16); filter: drop-shadow(0 10px 22px rgba(255, 180, 40, 0.65)) drop-shadow(0 0 16px rgba(255, 200, 80, 0.45)); }
  54% { transform: scale(0.94); filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.4)); }
  72% { transform: scale(1.08); filter: drop-shadow(0 6px 14px rgba(255, 160, 30, 0.5)); }
}
@media (prefers-reduced-motion: reduce) {
  .mzc-anim-layer { animation: none !important; }
}
`;

/**
 * Квадратный логотип MyZCode (вшит инлайном, чтобы не зависеть от загрузки файла
 * до первого рендера и работать в любом контексте тем). Фирменные градиенты
 * получают id, производный от useId: на странице может быть несколько логотипов,
 * и одинаковые id градиентов в разных экземплярах конфликтовать не должны.
 *
 * animated=true включает пульс-«змейку» (прелоадер); false — статичный логотип
 * (шапка окна и прочие постоянные места).
 */
export function MyZCodeLogo({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `mzc-${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const wrap = (cls: string, node: ReactNode) =>
    animated ? <g className={`mzc-anim-layer ${cls}`}>{node}</g> : node;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 102.4 102.4"
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      {animated ? <style>{ANIMATION_STYLES}</style> : null}
      <defs>
        <linearGradient
          id={id("edge")}
          gradientUnits="userSpaceOnUse"
          x1={93.44}
          y1={85.76}
          x2={93.44}
          y2={102.4}
        >
          <stop offset="0" stopColor="#022545" />
          <stop offset="1" stopColor="#012C4D" />
        </linearGradient>
        <radialGradient
          id={id("outer")}
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(0.999692 0 0 0.999685 0 0)"
          cx={51.2}
          cy={51.2}
          r={82.96}
          fx={51.2}
          fy={51.2}
        >
          <stop offset="0" stopColor="#025884" />
          <stop offset="0.54902" stopColor="#01375D" />
          <stop offset="1" stopColor="#000A2A" />
        </radialGradient>
        <radialGradient
          id={id("mid")}
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(1.00031 0 0 1.00031 0 0)"
          cx={51.26}
          cy={51.3}
          r={66.76}
          fx={51.26}
          fy={51.3}
        >
          <stop offset="0" stopColor="#014B7A" />
          <stop offset="0.568627" stopColor="#012F57" />
          <stop offset="1" stopColor="#000723" />
        </radialGradient>
        <radialGradient
          id={id("inner")}
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(0.99968 0 0 0.999685 0 0)"
          cx={51.25}
          cy={51.35}
          r={50.01}
          fx={51.25}
          fy={51.35}
        >
          <stop offset="0" stopColor="#013E68" />
          <stop offset="0.580392" stopColor="#00274E" />
          <stop offset="1" stopColor="#000824" />
        </radialGradient>
        <radialGradient
          id={id("core")}
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(1.00654 0 0 1.00652 0 0)"
          cx={51.25}
          cy={51.35}
          r={33.33}
          fx={51.25}
          fy={51.35}
        >
          <stop offset="0" stopColor="#012F58" />
          <stop offset="1" stopColor="#000723" />
        </radialGradient>
      </defs>
      <rect width="102.4" height="102.4" rx="15.16" ry="15.16" fill={url("edge")} />
      <path
        fill={url("outer")}
        d="M15.36 0l71.68 0c8.48,0 15.36,6.88 15.36,15.36l0 71.68c0,8.48 -6.88,15.36 -15.36,15.36l-71.68 0c-8.48,0 -15.36,-6.88 -15.36,-15.36l0 -71.68c0,-8.48 6.88,-15.36 15.36,-15.36z"
      />
      {wrap(
        "mzc-anim-circle-outer",
        <circle fill={url("mid")} cx={51.26} cy={51.3} r={41.2} />,
      )}
      {wrap(
        "mzc-anim-circle-mid",
        <circle fill={url("inner")} cx={51.25} cy={51.35} r={30.86} />,
      )}
      {wrap(
        "mzc-anim-circle-inner",
        <circle fill={url("core")} cx={51.25} cy={51.35} r={20.57} />,
      )}
      {wrap(
        "mzc-anim-logo-group",
        <>
          <path
            fill="#ffffff"
            d="M17.79 21.37l0 8.64 26.91 0c1.22,0 2.37,-0.63 3.19,-1.72l4.81 -6.92 -34.91 0zm40.43 0l-15.49 21.97c0.2,0.1 0.4,0.23 0.58,0.38 0.73,-1.25 2.19,-2.02 3.64,-1.81l4.07 0.61c2.15,0.48 3.24,2.67 2.52,4.69l-3.11 8.7 1.5 5.84c0.54,1.81 -0.35,3.75 -2.15,4.42l-3.71 0.76c-2.06,0.43 -4.02,-1.02 -4.27,-3.11l-0.78 -6.17 -3.65 -4.14 1.61 8.46c0.52,1.77 -0.18,3.85 -1.82,4.78l-4.59 2.62c-1.22,0.59 -2.64,0.51 -3.78,-0.23 -1.29,-0.83 -1.56,-1.77 -1.91,-3.08 -0.1,0.07 -0.21,0.14 -0.32,0.2l-10.41 14.77 28.03 0 42.07 -59.66 -28.03 0zm26.39 59.66l0 -8.66 -26.91 0c-1.22,0 -2.37,0.63 -3.19,1.72l-4.81 6.94 34.91 0z"
          />
          <path
            fill="#FFB438"
            d="M31.08 66.99c0.1,-0.02 0.2,-0.06 0.29,-0.1l0.02 -0.01 4.4 -2.52c0.54,-0.35 0.75,-1.09 0.51,-1.73l-4.13 -21.68c-0.01,-0.69 -0.48,-1.3 -1.11,-1.43l-4.98 -0.71 -0.03 -0.01c-0.1,-0.01 -0.22,0 -0.33,0.02 -0.51,0.1 -0.94,0.52 -1.07,1.05l-2.81 13.4 -7.82 -11.39c-0.32,-0.44 -0.88,-0.66 -1.39,-0.57 -0.11,0.02 -0.22,0.06 -0.31,0.11l-4.39 2.51c-0.54,0.35 -0.76,1.09 -0.52,1.73l4.13 21.68c0.02,0.69 0.49,1.3 1.12,1.42l4.72 0.71c0.1,0.02 0.21,0.01 0.31,-0.01 0.57,-0.11 0.96,-0.65 0.93,-1.29l0 -0.03 -1.28 -11.26 3.78 6.69c0.31,0.58 0.97,0.94 1.58,0.84l2.17 -0.41c0.58,-0.13 1.07,-0.72 1.13,-1.38l0.88 -7.28 2.86 10.75 0 0.03c0.21,0.61 0.77,0.97 1.34,0.87l0 0zm17.65 -3.37l0.01 0c0.21,-0.06 0.39,-0.2 0.5,-0.4 0.1,-0.2 0.13,-0.44 0.07,-0.66l-1.64 -6.37c-0.04,-0.16 -0.05,-0.46 -0.03,-0.64l3.31 -9.26c0.09,-0.22 0.1,-0.46 0,-0.67 -0.1,-0.21 -0.29,-0.36 -0.53,-0.42l-0.01 0 -3.86 -0.56 -0.02 -0.01c-0.07,0 -0.14,0 -0.21,0.02 -0.34,0.06 -0.63,0.34 -0.73,0.67l0 0.01 -1.1 4.66 -2.73 -3.95c-0.22,-0.29 -0.59,-0.43 -0.94,-0.37 -0.06,0.01 -0.13,0.04 -0.19,0.07l-0.01 0 -3.51 1.99 -0.01 0.01c-0.2,0.14 -0.32,0.35 -0.33,0.58 -0.01,0.23 0.07,0.45 0.24,0.62l6.48 7.34c0.08,0.17 0.18,0.45 0.2,0.6l0.84 6.58c0.02,0.24 0.13,0.45 0.3,0.6 0.17,0.15 0.39,0.21 0.61,0.19l0.02 0 3.27 -0.63z"
          />
        </>,
      )}
    </svg>
  );
}
