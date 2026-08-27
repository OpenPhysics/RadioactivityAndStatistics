/**
 * RadioactivityAndMeasurementsScreenIcons.ts
 *
 * Programmatic home-screen and navigation-bar icons, drawn on the standard PhET
 * 548 × 373 canvas using the sim's own colors so they follow the active profile.
 *
 * Each icon is a miniature of what its screen is about: the Intro icon is a
 * fluctuating count-rate trace about its mean, the Lab icon is a histogram with
 * a bell curve over it. They use the same colours as the real charts, so the
 * home screen previews what the screen actually looks like.
 */
import { Shape } from "scenerystack/kite";
import { Circle, Line, Node, Path, Rectangle } from "scenerystack/scenery";
import { ScreenIcon } from "scenerystack/sim";
import RadioactivityAndMeasurementsColors from "../RadioactivityAndMeasurementsColors.js";

const W = 548;
const H = 373;

/** Inset of the drawing area from the icon edge. */
const INSET = 60;

function background(): Rectangle {
  return new Rectangle(0, 0, W, H, { fill: RadioactivityAndMeasurementsColors.backgroundColorProperty });
}

function iconFrom(content: Node): ScreenIcon {
  return new ScreenIcon(content, {
    maxIconWidthProportion: 1,
    maxIconHeightProportion: 1,
    fill: RadioactivityAndMeasurementsColors.backgroundColorProperty,
  });
}

/**
 * Intro: a count rate scattering about its mean.
 *
 * The sample heights are fixed rather than random so the icon is identical on
 * every launch — an icon that changed shape between sessions would read as a
 * different screen.
 */
export function createIntroIcon(): ScreenIcon {
  const samples = [0.55, 0.78, 0.34, 0.62, 0.45, 0.86, 0.5, 0.28, 0.7, 0.4];
  const left = INSET;
  const right = W - INSET;
  const bottom = H - INSET;
  const top = INSET;

  const x = (index: number) => left + ((right - left) * index) / (samples.length - 1);
  const y = (fraction: number) => bottom - (bottom - top) * fraction;

  const traceShape = new Shape();
  samples.forEach((fraction, index) => {
    if (index === 0) {
      traceShape.moveTo(x(index), y(fraction));
    } else {
      traceShape.lineTo(x(index), y(fraction));
    }
  });

  const meanFraction = samples.reduce((total, value) => total + value, 0) / samples.length;

  return iconFrom(
    new Node({
      children: [
        background(),
        new Line(left, y(meanFraction), right, y(meanFraction), {
          stroke: RadioactivityAndMeasurementsColors.chartAxisColorProperty,
          lineWidth: 5,
          lineDash: [16, 12],
        }),
        new Path(traceShape, {
          stroke: RadioactivityAndMeasurementsColors.countRateTraceColorProperty,
          lineWidth: 8,
          lineJoin: "round",
        }),
        ...samples.map(
          (fraction, index) =>
            new Circle(10, {
              fill: RadioactivityAndMeasurementsColors.countRateTraceColorProperty,
              centerX: x(index),
              centerY: y(fraction),
            }),
        ),
      ],
    }),
  );
}

/** Lab: a histogram of counts with the Poisson curve drawn over it. */
export function createLabIcon(): ScreenIcon {
  const bars = [0.12, 0.3, 0.62, 0.92, 0.78, 0.45, 0.2, 0.08];
  const left = INSET;
  const right = W - INSET;
  const bottom = H - INSET;
  const top = INSET;
  const barSpan = (right - left) / bars.length;
  const barGap = 6;

  const barNodes = bars.map((fraction, index) => {
    const height = (bottom - top) * fraction;
    return new Rectangle(left + index * barSpan + barGap / 2, bottom - height, barSpan - barGap, height, {
      fill: RadioactivityAndMeasurementsColors.histogramBarColorProperty,
    });
  });

  // A Gaussian through the same peak the bars describe, sampled smoothly.
  const peakIndex = bars.indexOf(Math.max(...bars));
  const mean = left + (peakIndex + 0.5) * barSpan;
  const deviation = barSpan * 1.5;
  const amplitude = (bottom - top) * 0.95;

  const curveShape = new Shape();
  const pointCount = 60;
  for (let i = 0; i <= pointCount; i++) {
    const px = left + ((right - left) * i) / pointCount;
    const z = (px - mean) / deviation;
    const py = bottom - amplitude * Math.exp(-0.5 * z * z);
    if (i === 0) {
      curveShape.moveTo(px, py);
    } else {
      curveShape.lineTo(px, py);
    }
  }

  return iconFrom(
    new Node({
      children: [
        background(),
        ...barNodes,
        new Path(curveShape, {
          stroke: RadioactivityAndMeasurementsColors.poissonCurveColorProperty,
          lineWidth: 8,
          lineJoin: "round",
        }),
      ],
    }),
  );
}
