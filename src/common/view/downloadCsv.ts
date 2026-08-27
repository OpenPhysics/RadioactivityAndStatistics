/**
 * downloadCsv.ts
 *
 * Hands a CSV string to the browser as a file download.
 *
 * Isolated from the CSV *generation* in common/model/csvExport.ts so that the
 * serialization stays pure and unit-testable, and everything touching the DOM
 * lives in one small, obviously-side-effecting function.
 */

/**
 * Triggers a download of `contents` as `filename`.
 *
 * @returns true when the download was started, false when the environment has
 *          no DOM to start it in (a unit test, say) — callers can ignore this;
 *          it exists so the function never throws in a headless context.
 */
export function downloadCsv(filename: string, contents: string): boolean {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return false;
  }

  // The BOM makes Excel open UTF-8 CSV as UTF-8 rather than as the system
  // codepage, which otherwise mangles the µ, σ and √ in the header comments.
  const blob = new Blob([`﻿${contents}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoking immediately can cancel the download in some browsers; one turn of
  // the event loop is enough for the click to have been consumed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
