/**
 * HistogramNode.ts
 *
 * The Lab screen's centrepiece: the distribution of counts per interval, with
 * the theoretical curves drawn over it.
 *
 * ── Reading the chart ─────────────────────────────────────────────────────────
 * The bars are the measurement and are drawn in a neutral fill, so the three
 * model curves read as figure against them. Each curve carries both a colour
 * and its own dash pattern, so the set stays separable in greyscale, in print,
 * and to a colour-blind reader; the legend swatches show the dash patterns for
 * exactly that reason.
 *
 * ── Scaling ───────────────────────────────────────────────────────────────────
 * The axes follow the data. The y axis is scaled to whichever is taller — the
 * tallest bar or the peak of a visible curve — so a Poisson curve for a mean
 * the data has not reached yet is never silently clipped off the top.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import {
  BarPlot,
  ChartRectangle,
  ChartTransform,
  GridLineSet,
  LinePlot,
  TickLabelSet,
  TickMarkSet,
} from "scenerystack/bamboo";
import { Range, Vector2 } from "scenerystack/dot";
import { Orientation } from "scenerystack/phet-core";
import { HBox, Line, Node, type ProfileColorProperty, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import {
  CURVE_DASH_PATTERNS,
  CURVE_LINE_WIDTH,
  HISTOGRAM_BAR_GAP,
  HISTOGRAM_CHART_SIZE,
} from "../../RadioactivityAndStatisticsConstants.js";
import { gaussianCurve, type Histogram, poissonExpectation } from "../model/Histogram.js";
import type { RadioactivityModel } from "../model/RadioactivityModel.js";
import { chooseTickSpacing } from "./chartTicks.js";

/** Fraction of headroom left above the tallest mark. */
const Y_HEADROOM = 1.15;

/** Axis ranges used before any data has been collected. */
const DEFAULT_X_RANGE = new Range(0, 40);
const DEFAULT_Y_RANGE = new Range(0, 10);

/** Roughly how many ticks to aim for on each axis. */
const TARGET_TICK_COUNT = 8;

/** Visibility of each model curve, owned by the screen model. */
export type CurveVisibility = {
  readonly poissonVisibleProperty: TReadOnlyProperty<boolean>;
  readonly gaussianPredictionVisibleProperty: TReadOnlyProperty<boolean>;
  readonly gaussianFitVisibleProperty: TReadOnlyProperty<boolean>;
};

export class HistogramNode extends VBox {
  private readonly chartTransform: ChartTransform;
  private readonly barPlot: BarPlot;
  private readonly poissonPlot: LinePlot;
  private readonly gaussianPredictionPlot: LinePlot;
  private readonly gaussianFitPlot: LinePlot;
  private readonly xTickLabels: TickLabelSet;
  private readonly yTickLabels: TickLabelSet;
  private readonly xGridLines: GridLineSet;
  private readonly yGridLines: GridLineSet;
  private readonly xTickMarks: TickMarkSet;
  private readonly yTickMarks: TickMarkSet;
  private readonly model: RadioactivityModel;
  private readonly curves: CurveVisibility;
  private readonly disposeHistogramNode: () => void;

  public constructor(model: RadioactivityModel, curves: CurveVisibility) {
    const strings = StringManager.getInstance().getHistogramStrings();

    const chartTransform = new ChartTransform({
      viewWidth: HISTOGRAM_CHART_SIZE.width,
      viewHeight: HISTOGRAM_CHART_SIZE.height,
      modelXRange: DEFAULT_X_RANGE,
      modelYRange: DEFAULT_Y_RANGE,
    });

    const chartRectangle = new ChartRectangle(chartTransform, {
      fill: RadioactivityAndStatisticsColors.chartSurfaceColorProperty,
      stroke: RadioactivityAndStatisticsColors.chartBorderColorProperty,
      cornerXRadius: 3,
      cornerYRadius: 3,
    });

    const gridOptions = {
      stroke: RadioactivityAndStatisticsColors.chartGridColorProperty,
      lineWidth: 1,
    };
    const xGridLines = new GridLineSet(chartTransform, Orientation.HORIZONTAL, 10, gridOptions);
    const yGridLines = new GridLineSet(chartTransform, Orientation.VERTICAL, 5, gridOptions);

    const barPlot = new BarPlot(chartTransform, [], {
      barWidth: 10,
      pointToPaintableFields: () => ({
        fill: RadioactivityAndStatisticsColors.histogramBarColorProperty,
      }),
    });

    const poissonPlot = new LinePlot(chartTransform, [], {
      stroke: RadioactivityAndStatisticsColors.poissonCurveColorProperty,
      lineWidth: CURVE_LINE_WIDTH,
      lineDash: [...CURVE_DASH_PATTERNS.poisson],
    });
    const gaussianPredictionPlot = new LinePlot(chartTransform, [], {
      stroke: RadioactivityAndStatisticsColors.gaussianPredictionColorProperty,
      lineWidth: CURVE_LINE_WIDTH,
      lineDash: [...CURVE_DASH_PATTERNS.gaussianPrediction],
    });
    const gaussianFitPlot = new LinePlot(chartTransform, [], {
      stroke: RadioactivityAndStatisticsColors.gaussianFitColorProperty,
      lineWidth: CURVE_LINE_WIDTH,
      lineDash: [...CURVE_DASH_PATTERNS.gaussianFit],
    });

    // Everything that can run past the axes is clipped to the plot area, so a
    // tall curve cannot spill over the tick labels.
    const plotArea = new Node({
      children: [xGridLines, yGridLines, barPlot, poissonPlot, gaussianPredictionPlot, gaussianFitPlot],
      clipArea: chartRectangle.getShape(),
    });

    const axisOptions = {
      stroke: RadioactivityAndStatisticsColors.chartAxisColorProperty,
      lineWidth: 1,
    };
    const tickLabelOptions = {
      edge: "min" as const,
      createLabel: (value: number) =>
        new Text(formatTick(value), {
          font: new PhetFont(11),
          fill: RadioactivityAndStatisticsColors.chartAxisColorProperty,
        }),
    };

    const xTickMarks = new TickMarkSet(chartTransform, Orientation.HORIZONTAL, 10, { edge: "min", ...axisOptions });
    const yTickMarks = new TickMarkSet(chartTransform, Orientation.VERTICAL, 5, { edge: "min", ...axisOptions });
    const xTickLabels = new TickLabelSet(chartTransform, Orientation.HORIZONTAL, 10, tickLabelOptions);
    const yTickLabels = new TickLabelSet(chartTransform, Orientation.VERTICAL, 5, tickLabelOptions);

    // No AxisLine nodes: ChartRectangle already strokes the plot border, and
    // both axes start at zero so an axis line would sit exactly on it. An
    // AxisLine also anchors to model coordinate 0, which leaves the plot
    // entirely once the data narrows the range away from zero — inflating
    // this node's bounds and shoving it under a neighbouring panel.
    const chart = new Node({
      children: [chartRectangle, plotArea, xTickMarks, yTickMarks, xTickLabels, yTickLabels],
    });

    const axisTitleOptions = {
      font: new PhetFont(12),
      fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
    };
    const yAxisTitle = new Text(strings.axisFrequencyStringProperty, { ...axisTitleOptions, rotation: -Math.PI / 2 });
    const xAxisTitle = new Text(strings.axisCountsStringProperty, axisTitleOptions);

    const plotWithAxes = new HBox({
      spacing: 4,
      align: "center",
      children: [yAxisTitle, new VBox({ spacing: 24, children: [chart, xAxisTitle] })],
    });

    // ── Legend ────────────────────────────────────────────────────────────────
    // Present whenever more than one mark is on screen, which is always: the
    // bars plus at least one curve. Swatches reproduce each curve's dash
    // pattern so identity survives without colour.
    const legend = new HBox({
      spacing: 14,
      children: [
        legendEntry(
          strings.poissonStringProperty,
          RadioactivityAndStatisticsColors.poissonCurveColorProperty,
          [...CURVE_DASH_PATTERNS.poisson],
          curves.poissonVisibleProperty,
        ),
        legendEntry(
          strings.gaussianPredictionStringProperty,
          RadioactivityAndStatisticsColors.gaussianPredictionColorProperty,
          [...CURVE_DASH_PATTERNS.gaussianPrediction],
          curves.gaussianPredictionVisibleProperty,
        ),
        legendEntry(
          strings.gaussianFitStringProperty,
          RadioactivityAndStatisticsColors.gaussianFitColorProperty,
          [...CURVE_DASH_PATTERNS.gaussianFit],
          curves.gaussianFitVisibleProperty,
        ),
      ],
    });

    super({
      align: "center",
      spacing: 8,
      children: [plotWithAxes, legend],
    });

    this.model = model;
    this.curves = curves;
    this.chartTransform = chartTransform;
    this.barPlot = barPlot;
    this.poissonPlot = poissonPlot;
    this.gaussianPredictionPlot = gaussianPredictionPlot;
    this.gaussianFitPlot = gaussianFitPlot;
    this.xTickLabels = xTickLabels;
    this.yTickLabels = yTickLabels;
    this.xGridLines = xGridLines;
    this.yGridLines = yGridLines;
    this.xTickMarks = xTickMarks;
    this.yTickMarks = yTickMarks;

    const update = () => this.updateChart();
    model.histogramProperty.link(update);
    model.statisticsProperty.link(update);
    model.gaussianFitProperty.link(update);
    curves.poissonVisibleProperty.link(update);
    curves.gaussianPredictionVisibleProperty.link(update);
    curves.gaussianFitVisibleProperty.link(update);

    this.disposeHistogramNode = () => {
      model.histogramProperty.unlink(update);
      model.statisticsProperty.unlink(update);
      model.gaussianFitProperty.unlink(update);
      curves.poissonVisibleProperty.unlink(update);
      curves.gaussianPredictionVisibleProperty.unlink(update);
      curves.gaussianFitVisibleProperty.unlink(update);
    };
  }

  /** Rebuilds every data set and rescales the axes to fit. */
  private updateChart(): void {
    const histogram = this.model.histogramProperty.value;
    const statistics = this.model.statisticsProperty.value;
    const fit = this.model.gaussianFitProperty.value;

    const bars = histogram.binCenters.map((center, index) => new Vector2(center, histogram.binCounts[index] ?? 0));

    const poissonPoints = this.curves.poissonVisibleProperty.value ? poissonPolyline(histogram, statistics.mean) : [];
    const gaussianPredictionPoints = this.curves.gaussianPredictionVisibleProperty.value
      ? gaussianCurve(histogram, statistics.mean, Math.sqrt(Math.max(statistics.mean, 0))).map(
          (point) => new Vector2(point.x, point.y),
        )
      : [];
    const gaussianFitPoints =
      this.curves.gaussianFitVisibleProperty.value && fit
        ? sampleFittedGaussian(histogram, fit.amplitude, fit.mean, fit.standardDeviation)
        : [];

    // ── Axis ranges ───────────────────────────────────────────────────────────
    if (histogram.binCounts.length === 0) {
      this.chartTransform.setModelXRange(DEFAULT_X_RANGE);
      this.chartTransform.setModelYRange(DEFAULT_Y_RANGE);
    } else {
      const xMinimum = histogram.minimumEdge;
      const xMaximum = histogram.minimumEdge + histogram.binCounts.length * histogram.binWidth;
      this.chartTransform.setModelXRange(new Range(xMinimum, xMaximum));

      const curvePeak = Math.max(
        0,
        ...poissonPoints.map((point) => point.y),
        ...gaussianPredictionPoints.map((point) => point.y),
        ...gaussianFitPoints.map((point) => point.y),
      );
      const yMaximum = Math.max(histogram.maximumBinCount, curvePeak) * Y_HEADROOM;
      this.chartTransform.setModelYRange(new Range(0, Math.max(yMaximum, 1)));
    }

    this.barPlot.barWidth = Math.max(1, this.chartTransform.modelToViewDeltaX(histogram.binWidth) - HISTOGRAM_BAR_GAP);
    this.barPlot.setDataSet(bars);
    this.poissonPlot.setDataSet(poissonPoints);
    this.gaussianPredictionPlot.setDataSet(gaussianPredictionPoints);
    this.gaussianFitPlot.setDataSet(gaussianFitPoints);

    // ── Tick spacing ──────────────────────────────────────────────────────────
    // Counts are integers, so the x spacing never drops below 1.
    const xSpacing = chooseTickSpacing(this.chartTransform.modelXRange.getLength(), TARGET_TICK_COUNT, 1);
    const ySpacing = chooseTickSpacing(this.chartTransform.modelYRange.getLength(), TARGET_TICK_COUNT, 1);
    this.xTickMarks.setSpacing(xSpacing);
    this.xTickLabels.setSpacing(xSpacing);
    this.xGridLines.setSpacing(xSpacing);
    this.yTickMarks.setSpacing(ySpacing);
    this.yTickLabels.setSpacing(ySpacing);
    this.yGridLines.setSpacing(ySpacing);
  }

  public override dispose(): void {
    this.disposeHistogramNode();
    super.dispose();
  }
}

/**
 * The Poisson expectation as a step polyline across the bins.
 *
 * Drawn as steps rather than a smooth curve because the Poisson distribution is
 * discrete: the expectation is a per-bin quantity, and a smooth interpolation
 * would imply values between bins that the distribution does not define.
 */
function poissonPolyline(histogram: Histogram, mean: number): Vector2[] {
  if (histogram.binCounts.length === 0 || mean <= 0) {
    return [];
  }
  const expectation = poissonExpectation(histogram, mean);
  const points: Vector2[] = [];
  for (let index = 0; index < expectation.length; index++) {
    const left = histogram.minimumEdge + index * histogram.binWidth;
    const right = left + histogram.binWidth;
    const y = expectation[index] ?? 0;
    points.push(new Vector2(left, y), new Vector2(right, y));
  }
  return points;
}

/** Samples the fitted Gaussian across the plotted range. */
function sampleFittedGaussian(
  histogram: Histogram,
  amplitude: number,
  mean: number,
  standardDeviation: number,
  pointCount = 120,
): Vector2[] {
  if (histogram.binCounts.length === 0 || standardDeviation <= 0) {
    return [];
  }
  const start = histogram.minimumEdge;
  const end = histogram.minimumEdge + histogram.binCounts.length * histogram.binWidth;

  const points: Vector2[] = [];
  for (let index = 0; index <= pointCount; index++) {
    const x = start + ((end - start) * index) / pointCount;
    const z = (x - mean) / standardDeviation;
    points.push(new Vector2(x, amplitude * Math.exp(-0.5 * z * z)));
  }
  return points;
}

/** One legend entry: a dashed swatch in the curve's colour, plus its name. */
function legendEntry(
  labelProperty: TReadOnlyProperty<string>,
  colorProperty: ProfileColorProperty,
  lineDash: number[],
  visibleProperty: TReadOnlyProperty<boolean>,
): Node {
  const swatch = new Line(0, 0, 22, 0, {
    stroke: colorProperty,
    lineWidth: CURVE_LINE_WIDTH,
    lineDash,
  });
  return new HBox({
    spacing: 5,
    // Hidden rather than greyed out: a legend entry for a curve that is not
    // drawn is noise, and the checkbox that controls it is right there.
    visibleProperty,
    children: [
      swatch,
      new Text(labelProperty, {
        font: new PhetFont(11),
        fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
        maxWidth: 150,
      }),
    ],
  });
}

/** Formats a tick value, dropping the decimal point on whole numbers. */
function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}
