/**
 * CountRateChartNode.ts
 *
 * The Intro screen's strip chart: measured count rate against time, with the
 * running mean drawn across it.
 *
 * ── What it is for ────────────────────────────────────────────────────────────
 * This chart makes the sim's central point visible before any statistics are
 * computed. The trace wanders, sometimes well away from the mean line, and yet
 * nothing about the source changed — that scatter is the physics, not sloppy
 * measurement. The Lab screen then quantifies exactly that scatter.
 *
 * The mean is a reference line rather than a second data series, so it is drawn
 * recessively — dashed, in the axis colour — and never competes with the trace.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import {
  ChartRectangle,
  ChartTransform,
  GridLineSet,
  LinePlot,
  ScatterPlot,
  TickLabelSet,
  TickMarkSet,
} from "scenerystack/bamboo";
import { Range, Vector2 } from "scenerystack/dot";
import { Orientation } from "scenerystack/phet-core";
import { HBox, Line, Node, type ProfileColorProperty, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import { CURVE_LINE_WIDTH, RATE_CHART_SIZE } from "../../RadioactivityAndStatisticsConstants.js";
import { countRate } from "../model/CountSample.js";
import type { RadioactivityModel } from "../model/RadioactivityModel.js";
import { chooseTickSpacing } from "./chartTicks.js";

/** Headroom above the highest plotted rate. */
const Y_HEADROOM = 1.2;

/** Axis ranges used before any data has been collected. */
const DEFAULT_X_RANGE = new Range(0, 20);
const DEFAULT_Y_RANGE = new Range(0, 30);

/** Roughly how many ticks to aim for on each axis. */
const TARGET_TICK_COUNT = 6;

/** Dash pattern of the mean reference line. */
const MEAN_LINE_DASH = [6, 4];

export class CountRateChartNode extends VBox {
  private readonly chartTransform: ChartTransform;
  private readonly tracePlot: LinePlot;
  private readonly pointPlot: ScatterPlot;
  private readonly meanPlot: LinePlot;
  private readonly xTickLabels: TickLabelSet;
  private readonly yTickLabels: TickLabelSet;
  private readonly xGridLines: GridLineSet;
  private readonly yGridLines: GridLineSet;
  private readonly xTickMarks: TickMarkSet;
  private readonly yTickMarks: TickMarkSet;
  private readonly model: RadioactivityModel;
  private readonly disposeCountRateChartNode: () => void;

  public constructor(model: RadioactivityModel) {
    const stringManager = StringManager.getInstance();
    const strings = stringManager.getRateChartStrings();
    const statisticsStrings = stringManager.getStatisticsStrings();

    const chartTransform = new ChartTransform({
      viewWidth: RATE_CHART_SIZE.width,
      viewHeight: RATE_CHART_SIZE.height,
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
    const xGridLines = new GridLineSet(chartTransform, Orientation.HORIZONTAL, 5, gridOptions);
    const yGridLines = new GridLineSet(chartTransform, Orientation.VERTICAL, 10, gridOptions);

    const meanPlot = new LinePlot(chartTransform, [], {
      stroke: RadioactivityAndStatisticsColors.chartAxisColorProperty,
      lineWidth: CURVE_LINE_WIDTH,
      lineDash: MEAN_LINE_DASH,
    });

    const tracePlot = new LinePlot(chartTransform, [], {
      stroke: RadioactivityAndStatisticsColors.countRateTraceColorProperty,
      lineWidth: CURVE_LINE_WIDTH,
    });

    // Markers make individual measurements countable at short runs, where the
    // trace alone reads as one continuous signal rather than N discrete samples.
    const pointPlot = new ScatterPlot(chartTransform, [], {
      fill: RadioactivityAndStatisticsColors.countRateTraceColorProperty,
      radius: 2.5,
    });

    const plotArea = new Node({
      children: [xGridLines, yGridLines, meanPlot, tracePlot, pointPlot],
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

    const xTickMarks = new TickMarkSet(chartTransform, Orientation.HORIZONTAL, 5, { edge: "min", ...axisOptions });
    const yTickMarks = new TickMarkSet(chartTransform, Orientation.VERTICAL, 10, { edge: "min", ...axisOptions });
    const xTickLabels = new TickLabelSet(chartTransform, Orientation.HORIZONTAL, 5, tickLabelOptions);
    const yTickLabels = new TickLabelSet(chartTransform, Orientation.VERTICAL, 10, tickLabelOptions);

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
    const yAxisTitle = new Text(strings.axisRateStringProperty, { ...axisTitleOptions, rotation: -Math.PI / 2 });
    const xAxisTitle = new Text(strings.axisTimeStringProperty, axisTitleOptions);

    const legend = new HBox({
      spacing: 14,
      children: [
        legendEntry(strings.axisRateStringProperty, RadioactivityAndStatisticsColors.countRateTraceColorProperty, []),
        legendEntry(
          statisticsStrings.meanStringProperty,
          RadioactivityAndStatisticsColors.chartAxisColorProperty,
          MEAN_LINE_DASH,
        ),
      ],
    });

    super({
      align: "center",
      spacing: 8,
      children: [
        new HBox({
          spacing: 4,
          align: "center",
          children: [yAxisTitle, new VBox({ spacing: 24, children: [chart, xAxisTitle] })],
        }),
        legend,
      ],
    });

    this.model = model;
    this.chartTransform = chartTransform;
    this.tracePlot = tracePlot;
    this.pointPlot = pointPlot;
    this.meanPlot = meanPlot;
    this.xTickLabels = xTickLabels;
    this.yTickLabels = yTickLabels;
    this.xGridLines = xGridLines;
    this.yGridLines = yGridLines;
    this.xTickMarks = xTickMarks;
    this.yTickMarks = yTickMarks;

    const update = () => this.updateChart();
    model.samplesProperty.link(update);

    this.disposeCountRateChartNode = () => {
      model.samplesProperty.unlink(update);
    };
  }

  /** Rebuilds the trace and rescales the axes to fit the run so far. */
  private updateChart(): void {
    const samples = this.model.samplesProperty.value;

    if (samples.length === 0) {
      this.chartTransform.setModelXRange(DEFAULT_X_RANGE);
      this.chartTransform.setModelYRange(DEFAULT_Y_RANGE);
      this.tracePlot.setDataSet([]);
      this.pointPlot.setDataSet([]);
      this.meanPlot.setDataSet([]);
      this.updateTickSpacing();
      return;
    }

    // Plot each sample at the midpoint of the interval it covers: the rate is
    // an average over the whole interval, not a value at either edge.
    const points = samples.map((sample) => new Vector2(sample.startTime + sample.duration / 2, countRate(sample)));

    const lastSample = samples[samples.length - 1];
    const xMaximum = lastSample ? lastSample.startTime + lastSample.duration : DEFAULT_X_RANGE.max;
    this.chartTransform.setModelXRange(new Range(0, Math.max(xMaximum, lastSample?.duration ?? 1)));

    const highestRate = Math.max(...points.map((point) => point.y), 1);
    this.chartTransform.setModelYRange(new Range(0, highestRate * Y_HEADROOM));

    this.tracePlot.setDataSet(points);
    this.pointPlot.setDataSet(points);

    const meanRate = this.model.statisticsProperty.value.mean / this.model.countingIntervalProperty.value;
    const xRange = this.chartTransform.modelXRange;
    this.meanPlot.setDataSet([new Vector2(xRange.min, meanRate), new Vector2(xRange.max, meanRate)]);

    this.updateTickSpacing();
  }

  /** Re-snaps tick spacing to round numbers for the current ranges. */
  private updateTickSpacing(): void {
    const xSpacing = chooseTickSpacing(this.chartTransform.modelXRange.getLength(), TARGET_TICK_COUNT);
    const ySpacing = chooseTickSpacing(this.chartTransform.modelYRange.getLength(), TARGET_TICK_COUNT);
    this.xTickMarks.setSpacing(xSpacing);
    this.xTickLabels.setSpacing(xSpacing);
    this.xGridLines.setSpacing(xSpacing);
    this.yTickMarks.setSpacing(ySpacing);
    this.yTickLabels.setSpacing(ySpacing);
    this.yGridLines.setSpacing(ySpacing);
  }

  public override dispose(): void {
    this.disposeCountRateChartNode();
    super.dispose();
  }
}

/** One legend entry: a swatch in the mark's colour and dash, plus its name. */
function legendEntry(
  labelProperty: TReadOnlyProperty<string>,
  colorProperty: ProfileColorProperty,
  lineDash: number[],
): Node {
  return new HBox({
    spacing: 5,
    children: [
      new Line(0, 0, 22, 0, { stroke: colorProperty, lineWidth: CURVE_LINE_WIDTH, lineDash }),
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
