/**
 * DataTableNode.ts
 *
 * The run as a scrolling table of numbers.
 *
 * ── Why it exists ─────────────────────────────────────────────────────────────
 * Beyond being the natural lab-notebook view of a run, the table is also the
 * accessibility relief for the charts: every value plotted on the histogram and
 * the rate chart is legible here as text, so nothing in the sim is conveyed by
 * colour or position alone.
 *
 * ── Row recycling ─────────────────────────────────────────────────────────────
 * A long run can hold hundreds of samples, but only a fixed window is ever
 * visible. Rather than build a Node per sample, the table allocates
 * TABLE_VISIBLE_ROWS rows once and rewrites their text as the window moves.
 * That keeps a hundred-sample run costing the same as a five-sample one.
 */

import { toFixed } from "scenerystack/dot";
import { Line, Node, Rectangle, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import { TABLE_ROW_HEIGHT, TABLE_VISIBLE_ROWS, TABLE_WIDTH } from "../../RadioactivityAndStatisticsConstants.js";
import { type CountSample, countRate } from "../model/CountSample.js";
import type { RadioactivityModel } from "../model/RadioactivityModel.js";
import { RadioactivityAndStatisticsPanel } from "../RadioactivityAndStatisticsPanel.js";

/** Left edge of each column, as a fraction of the table width. */
const COLUMN_FRACTIONS = [0.02, 0.26, 0.55, 0.99] as const;

/** Which columns are right-aligned (numeric) rather than left-aligned. */
const COLUMN_ALIGN = ["left", "left", "left", "right"] as const;

/** One recycled row: four Text nodes plus its stripe. */
type TableRow = {
  readonly stripe: Rectangle;
  readonly cells: readonly Text[];
};

export class DataTableNode extends RadioactivityAndStatisticsPanel {
  private readonly rows: readonly TableRow[];
  private readonly emptyMessage: Text;
  private readonly disposeDataTableNode: () => void;

  public constructor(model: RadioactivityModel) {
    const strings = StringManager.getInstance().getTableStrings();

    const title = new Text(strings.titleStringProperty, {
      font: new PhetFont({ size: 15, weight: "bold" }),
      fill: RadioactivityAndStatisticsColors.textColorProperty,
    });

    // ── Header ────────────────────────────────────────────────────────────────
    const headerProperties = [
      strings.columnIndexStringProperty,
      strings.columnTimeStringProperty,
      strings.columnCountsStringProperty,
      strings.columnRateStringProperty,
    ];
    const header = new Node({
      children: headerProperties.map(
        (property, column) =>
          new Text(property, {
            font: new PhetFont({ size: 11, weight: "bold" }),
            fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
            maxWidth: TABLE_WIDTH * 0.28,
            ...positionFor(column),
          }),
      ),
    });

    const headerRule = new Line(0, 0, TABLE_WIDTH, 0, {
      stroke: RadioactivityAndStatisticsColors.tableRuleColorProperty,
      lineWidth: 1,
    });

    // ── Recycled body rows ────────────────────────────────────────────────────
    const rows: TableRow[] = [];
    const bodyChildren: Node[] = [];
    for (let rowIndex = 0; rowIndex < TABLE_VISIBLE_ROWS; rowIndex++) {
      const y = rowIndex * TABLE_ROW_HEIGHT;

      // Alternating stripes give the eye something to track along a wide row.
      const stripe = new Rectangle(0, y, TABLE_WIDTH, TABLE_ROW_HEIGHT, {
        fill: rowIndex % 2 === 0 ? RadioactivityAndStatisticsColors.tableStripeColorProperty : null,
      });

      const cells = COLUMN_FRACTIONS.map(
        (_, column) =>
          new Text("", {
            font: new PhetFont(11),
            fill: RadioactivityAndStatisticsColors.textColorProperty,
            maxWidth: TABLE_WIDTH * 0.28,
            ...positionFor(column, y + TABLE_ROW_HEIGHT / 2),
          }),
      );

      rows.push({ stripe, cells });
      bodyChildren.push(stripe, ...cells);
    }

    const body = new Node({ children: bodyChildren });

    const emptyMessage = new Text(strings.emptyStringProperty, {
      font: new PhetFont(12),
      fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
      maxWidth: TABLE_WIDTH,
      centerY: (TABLE_VISIBLE_ROWS * TABLE_ROW_HEIGHT) / 2,
      x: 0,
    });

    super(
      new VBox({
        align: "left",
        spacing: 4,
        children: [title, header, headerRule, new Node({ children: [body, emptyMessage] })],
      }),
      { minWidth: TABLE_WIDTH + 24 },
    );

    this.rows = rows;
    this.emptyMessage = emptyMessage;

    // Only the tail of a run is ever on screen, so redraws are bounded work.
    const samplesListener = (samples: readonly CountSample[]) => this.updateRows(samples);
    model.samplesProperty.link(samplesListener);

    this.disposeDataTableNode = () => {
      model.samplesProperty.unlink(samplesListener);
    };
  }

  /** Rewrites the visible window of rows to show the most recent samples. */
  private updateRows(samples: readonly CountSample[]): void {
    this.emptyMessage.visible = samples.length === 0;

    const firstVisible = Math.max(0, samples.length - TABLE_VISIBLE_ROWS);
    for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex++) {
      const row = this.rows[rowIndex];
      if (!row) {
        continue;
      }
      const sample = samples[firstVisible + rowIndex];
      const isUsed = sample !== undefined;
      row.stripe.visible = isUsed;

      const values = sample
        ? [String(sample.index), toFixed(sample.startTime, 1), String(sample.counts), toFixed(countRate(sample), 1)]
        : ["", "", "", ""];

      for (let column = 0; column < row.cells.length; column++) {
        const cell = row.cells[column];
        if (cell) {
          cell.string = values[column] ?? "";
        }
      }
    }
  }

  public override dispose(): void {
    this.disposeDataTableNode();
    super.dispose();
  }
}

/** Positioning options for a cell in the given column. */
function positionFor(column: number, centerY?: number): Record<string, number> {
  const fraction = COLUMN_FRACTIONS[column] ?? 0;
  const x = fraction * TABLE_WIDTH;
  const horizontal = COLUMN_ALIGN[column] === "right" ? { right: x } : { left: x };
  return centerY === undefined ? horizontal : { ...horizontal, centerY };
}
