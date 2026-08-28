/**
 * usb-probe.js
 *
 * Throwaway bring-up tool: identifies how a PASCO Wireless Geiger Counter
 * (PS-3238) presents itself over USB, so the sim's USB transport can be written
 * against fact rather than guesswork. Not part of the sim bundle.
 *
 * Findings so far, against a real PS-3238 on Windows:
 *   - it is a HID device, and it streams 31-byte input reports on report id 1
 *     unsolicited, with no command sent first
 *   - sendReport(0, …) fails with NotAllowedError, so report id 0 is not the
 *     way in — which is why this tool now sweeps every id the descriptor
 *     declares, and every transfer type, and says which combination works
 */

const logElement = document.getElementById("log");

let lastLogTime = 0;

function log(...parts) {
  const now = performance.now();
  const sinceLast = lastLogTime === 0 ? 0 : Math.round(now - lastLogTime);
  lastLogTime = now;
  const text = parts.map((part) => (typeof part === "string" ? part : JSON.stringify(part, null, 2))).join(" ");
  const line = `+${String(sinceLast).padStart(5)}ms ${text}`;
  logElement.textContent += `${line}\n`;
  logElement.scrollTop = logElement.scrollHeight;

  // Mirror to probe-server.mjs when that is what served this page, so findings
  // land in a file rather than only in the browser. Under the Vite dev server
  // there is no /log route; the failure is expected and ignored.
  fetch("/log", { method: "POST", body: line }).catch(() => undefined);
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

const support = [
  ["navigator.hid (WebHID)", "hid"],
  ["navigator.serial (Web Serial)", "serial"],
  ["navigator.usb (WebUSB)", "usb"],
  ["navigator.bluetooth (Web Bluetooth)", "bluetooth"],
].map(([label, key]) => `<b>${label}</b>: ${navigator[key] ? "yes" : "NO"}`);
document.getElementById("support").innerHTML =
  `${support.join("<br>")}<br><b>isSecureContext</b>: ${window.isSecureContext}`;

/** Bytes one report carries, from the sizes in its report descriptor. */
function reportBytes(report) {
  const bits = (report.items ?? []).reduce((total, item) => total + item.reportSize * item.reportCount, 0);
  return bits / 8;
}

function describeReport(report) {
  return { reportId: report.reportId, bytes: reportBytes(report) };
}

/** The whole report descriptor, flattened — this is what pins the write path. */
function describeCollections(collections, depth = 0) {
  return collections.map((collection) => ({
    depth,
    usagePage: `0x${collection.usagePage.toString(16)}`,
    usage: `0x${collection.usage.toString(16)}`,
    inputReports: (collection.inputReports ?? []).map(describeReport),
    outputReports: (collection.outputReports ?? []).map(describeReport),
    featureReports: (collection.featureReports ?? []).map(describeReport),
    children: collection.children?.length > 0 ? describeCollections(collection.children, depth + 1) : undefined,
  }));
}

function describeDevice(device) {
  return {
    productName: device.productName,
    vendorId: `0x${device.vendorId.toString(16).padStart(4, "0")}`,
    productId: `0x${device.productId.toString(16).padStart(4, "0")}`,
    opened: device.opened,
    collections: describeCollections(device.collections),
  };
}

let hidDevice = null;

/** Tally of streamed input reports, keyed by their leading bytes. */
const streamTally = new Map();
let streamCount = 0;
let streamStart = 0;

function handleInputReport(event) {
  const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
  streamCount += 1;
  const key = `id ${event.reportId}: ${hex(bytes.subarray(0, 4))}`;
  streamTally.set(key, (streamTally.get(key) ?? 0) + 1);
  log(`<- reportId ${event.reportId} (${bytes.length}B): ${hex(bytes)}`);
}

/** Adopts a device: dumps its descriptor, opens it, listens. */
async function adopt(device) {
  hidDevice = device;
  log("HID device:", describeDevice(device));

  if (!device.opened) {
    await device.open();
  }
  device.addEventListener("inputreport", handleInputReport);
  streamStart = performance.now();
  log("open; listening for input reports.");

  for (const id of ["write", "stats"]) {
    document.getElementById(id).disabled = false;
  }
}

/** PASCO scientific, from the USB-IF registry. */
const PASCO_VENDOR_ID = 0x0945;

document.getElementById("hid").addEventListener("click", async () => {
  if (!navigator.hid) {
    log("WebHID unavailable in this browser.");
    return;
  }
  const devices = await navigator.hid.requestDevice({ filters: [] });
  if (devices.length === 0) {
    log("HID: nothing selected.");
    return;
  }
  await adopt(devices[0]);
});

// The decisive test. With the picker filtered to PASCO's vendor id, an empty
// list is itself the answer: the counter is not on this wire as a HID device,
// and no amount of picking the wrong row can muddy it.
document.getElementById("hid-pasco").addEventListener("click", async () => {
  if (!navigator.hid) {
    log("WebHID unavailable in this browser.");
    return;
  }
  const devices = await navigator.hid.requestDevice({ filters: [{ vendorId: PASCO_VENDOR_ID }] });
  if (devices.length === 0) {
    log("HID filtered to PASCO (0x0945): EMPTY — the counter is not a HID device, or is not enumerating.");
    return;
  }
  await adopt(devices[0]);
});

document.getElementById("usb-pasco").addEventListener("click", async () => {
  if (!navigator.usb) {
    log("WebUSB unavailable in this browser.");
    return;
  }
  try {
    const device = await navigator.usb.requestDevice({ filters: [{ vendorId: PASCO_VENDOR_ID }] });
    log("USB filtered to PASCO:", {
      manufacturerName: device.manufacturerName,
      productName: device.productName,
      serialNumber: device.serialNumber,
      vendorId: `0x${device.vendorId.toString(16).padStart(4, "0")}`,
      productId: `0x${device.productId.toString(16).padStart(4, "0")}`,
      deviceClass: device.deviceClass,
      configurations: device.configurations.map((configuration) => ({
        interfaces: configuration.interfaces.map((usbInterface) => ({
          number: usbInterface.interfaceNumber,
          alternates: usbInterface.alternates.map((alternate) => ({
            interfaceClass: alternate.interfaceClass,
            interfaceSubclass: alternate.interfaceSubclass,
            endpoints: alternate.endpoints.map((endpoint) => ({
              direction: endpoint.direction,
              type: endpoint.type,
              packetSize: endpoint.packetSize,
            })),
          })),
        })),
      })),
    });
  } catch (error) {
    log("USB filtered to PASCO: nothing (or cancelled) —", String(error));
  }
});

document.getElementById("serial").addEventListener("click", async () => {
  if (!navigator.serial) {
    log("Web Serial unavailable in this browser.");
    return;
  }
  try {
    const port = await navigator.serial.requestPort();
    log("Serial port:", port.getInfo());
  } catch (error) {
    log("Serial:", String(error));
  }
});

document.getElementById("usb").addEventListener("click", async () => {
  if (!navigator.usb) {
    log("WebUSB unavailable in this browser.");
    return;
  }
  try {
    const device = await navigator.usb.requestDevice({ filters: [] });
    log("USB device:", {
      manufacturerName: device.manufacturerName,
      productName: device.productName,
      serialNumber: device.serialNumber,
      vendorId: `0x${device.vendorId.toString(16).padStart(4, "0")}`,
      productId: `0x${device.productId.toString(16).padStart(4, "0")}`,
      deviceClass: device.deviceClass,
      configurations: device.configurations.map((configuration) => ({
        value: configuration.configurationValue,
        interfaces: configuration.interfaces.map((usbInterface) => ({
          number: usbInterface.interfaceNumber,
          alternates: usbInterface.alternates.map((alternate) => ({
            interfaceClass: alternate.interfaceClass,
            interfaceSubclass: alternate.interfaceSubclass,
            interfaceProtocol: alternate.interfaceProtocol,
            endpoints: alternate.endpoints.map((endpoint) => ({
              number: endpoint.endpointNumber,
              direction: endpoint.direction,
              type: endpoint.type,
              packetSize: endpoint.packetSize,
            })),
          })),
        })),
      })),
    });
  } catch (error) {
    log("USB:", String(error));
  }
});

document.getElementById("clear").addEventListener("click", () => {
  logElement.textContent = "";
});

/**
 * Sweeps every plausible way of writing to the device and reports which works.
 *
 * The one-shot read command is the payload throughout, so a success is not just
 * "the write was accepted" but "the counter answered" — watch the inbound lines
 * that follow each accepted write.
 */
document.getElementById("write").addEventListener("click", async () => {
  const device = hidDevice;
  if (!device?.opened) {
    log("Open a device first.");
    return;
  }

  const outputReports = device.collections.flatMap((collection) => collection.outputReports ?? []);
  const featureReports = device.collections.flatMap((collection) => collection.featureReports ?? []);
  log("declared output reports:", outputReports.map(describeReport));
  log("declared feature reports:", featureReports.map(describeReport));

  // Ids the descriptor actually declares come first; 0-2 follow as a fallback
  // for a device whose descriptor says less than it accepts.
  const candidates = [...new Set([...outputReports.map((r) => r.reportId), 0, 1, 2])];
  const command = [0x05, 0x04];

  for (const reportId of candidates) {
    const declared = outputReports.find((report) => report.reportId === reportId);
    const size = declared ? reportBytes(declared) : 31;
    const payload = new Uint8Array(Math.max(size, command.length));
    payload.set(command);

    log(`-> sendReport(${reportId}, ${payload.length}B): ${hex(payload)}`);
    try {
      await device.sendReport(reportId, payload);
      log(`   sendReport(${reportId}) ACCEPTED`);
    } catch (error) {
      log(`   sendReport(${reportId}) failed: ${String(error)}`);
    }
  }

  for (const report of featureReports) {
    const payload = new Uint8Array(Math.max(reportBytes(report), command.length));
    payload.set(command);
    log(`-> sendFeatureReport(${report.reportId}, ${payload.length}B): ${hex(payload)}`);
    try {
      await device.sendFeatureReport(report.reportId, payload);
      log(`   sendFeatureReport(${report.reportId}) ACCEPTED`);
    } catch (error) {
      log(`   sendFeatureReport(${report.reportId}) failed: ${String(error)}`);
    }
  }
});

// ── WebUSB: the wire the counter actually speaks ─────────────────────────────
// The PASCO USB Bridge is a vendor-specific (class 0xff) interface with one
// bulk endpoint each way, 64-byte packets. Claim it and the same PASCO command
// packets should go out and come back — that is what these buttons test.

let usbDevice = null;
let usbInEndpoint = 0;
let usbOutEndpoint = 0;
let usbReading = false;

/** Reads bulk IN forever, logging every packet, until the claim is dropped. */
async function readLoop() {
  while (usbReading && usbDevice) {
    let result;
    try {
      result = await usbDevice.transferIn(usbInEndpoint, 64);
    } catch (error) {
      log("transferIn failed:", String(error));
      usbReading = false;
      return;
    }
    if (result.status !== "ok") {
      log(`transferIn status: ${result.status}`);
    }
    if ((result.data?.byteLength ?? 0) > 0) {
      const bytes = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
      log(`<- bulk ${bytes.length}B: ${hex(bytes)}`);
    }
  }
}

document.getElementById("usb-claim").addEventListener("click", async () => {
  try {
    const permitted = await navigator.usb.getDevices();
    const device =
      permitted.find((candidate) => candidate.vendorId === PASCO_VENDOR_ID) ??
      (await navigator.usb.requestDevice({ filters: [{ vendorId: PASCO_VENDOR_ID }] }));

    await device.open();
    log("opened", device.productName);

    if (device.configuration === null) {
      await device.selectConfiguration(device.configurations[0].configurationValue);
    }
    const usbInterface = device.configuration.interfaces[0];
    const alternate = usbInterface.alternates[0];
    usbInEndpoint = alternate.endpoints.find((e) => e.direction === "in" && e.type === "bulk")?.endpointNumber;
    usbOutEndpoint = alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk")?.endpointNumber;
    log(`interface ${usbInterface.interfaceNumber}: bulk in = ${usbInEndpoint}, bulk out = ${usbOutEndpoint}`);

    await device.claimInterface(usbInterface.interfaceNumber);
    log("claimInterface OK — WebUSB can drive this device.");

    usbDevice = device;
    usbReading = true;
    readLoop();

    for (const id of ["usb-read", "usb-keepalive"]) {
      document.getElementById(id).disabled = false;
    }
  } catch (error) {
    log("claim failed:", String(error));
  }
});

/** Writes one PASCO command to the bulk OUT endpoint. */
async function sendBulk(label, bytes) {
  if (!usbDevice) {
    log("claim the interface first.");
    return;
  }
  const payload = new Uint8Array(bytes);
  log(`-> bulk ${label} ${payload.length}B: ${hex(payload)}`);
  try {
    const result = await usbDevice.transferOut(usbOutEndpoint, payload);
    log(`   transferOut status ${result.status}, ${result.bytesWritten}B written`);
  } catch (error) {
    log("   transferOut failed:", String(error));
  }
}

// ── Control transfers ────────────────────────────────────────────────────────
// The bulk pipe loops back unconditionally, so something has to open the data
// path first. On a vendor-specific device that is almost always a control
// request, and control is the one channel not yet tried.

/** Reads one descriptor by type and index; returns null on a stall. */
async function readDescriptor(device, type, index, language = 0x0409) {
  try {
    const result = await device.controlTransferIn(
      {
        requestType: "standard",
        recipient: "device",
        request: 0x06, // GET_DESCRIPTOR
        value: (type << 8) | index,
        index: type === 3 ? language : 0,
      },
      255,
    );
    if (result.status !== "ok" || (result.data?.byteLength ?? 0) === 0) {
      return null;
    }
    return new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
  } catch {
    return null;
  }
}

document.getElementById("usb-control-in").addEventListener("click", async () => {
  const device = usbDevice;
  if (!device) {
    log("claim the interface first.");
    return;
  }

  // String descriptors sometimes name the protocol outright; the BOS descriptor
  // is where a WebUSB-aware device publishes its landing page, which for PASCO
  // might point straight at documentation.
  for (let index = 0; index <= 6; index += 1) {
    const bytes = await readDescriptor(device, 3, index);
    if (bytes) {
      const text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
      log(`string descriptor ${index}: ${JSON.stringify(text)}  (${hex(bytes)})`);
    }
  }
  const bos = await readDescriptor(device, 0x0f, 0);
  log(bos ? `BOS descriptor: ${hex(bos)}` : "BOS descriptor: none (device is not WebUSB-aware)");

  // Vendor requests, read-only. A device that answers any of these is telling
  // us the request number that means something.
  for (const recipient of ["device", "interface"]) {
    for (let request = 0; request <= 31; request += 1) {
      try {
        const result = await device.controlTransferIn(
          { requestType: "vendor", recipient, request, value: 0, index: recipient === "interface" ? 0 : 0 },
          64,
        );
        if (result.status === "ok") {
          const bytes =
            (result.data?.byteLength ?? 0) > 0
              ? hex(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength))
              : "(no data)";
          log(`vendor IN ${recipient} request 0x${request.toString(16)}: OK ${bytes}`);
        }
      } catch {
        // A stall is the expected answer for an unsupported request; only the
        // ones that do not stall are interesting, so silence is correct here.
      }
    }
  }
  log("control-transfer read sweep done.");
});

/**
 * Writes one bulk packet and reads whatever comes back, with a deadline.
 *
 * Used by the OUT sweep to ask, after every control request, the only question
 * that matters: is the bulk pipe still echoing?
 */
async function exchange(bytes, timeoutMs = 300) {
  await usbDevice.transferOut(usbOutEndpoint, new Uint8Array(bytes));
  const reply = usbDevice.transferIn(usbInEndpoint, 64);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const result = await Promise.race([reply, timeout]);
  if (!result?.data) {
    return null;
  }
  return new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
}

/** Whether a reply is just the probe packet coming back unchanged. */
function isEcho(reply, sent) {
  return reply !== null && reply.length === sent.length && sent.every((byte, index) => reply[index] === byte);
}

document.getElementById("usb-control-out").addEventListener("click", async () => {
  const device = usbDevice;
  if (!device) {
    log("claim the interface first.");
    return;
  }

  // The read loop and the sweep cannot both own the IN endpoint. Stop it, then
  // flush the transfer it already has outstanding.
  usbReading = false;
  await exchange([0x00]).catch(() => undefined);
  log("read loop stopped; starting vendor control OUT sweep. Every request is logged before it is sent.");

  const probe = [0x05, 0x04];
  let opened = false;

  for (const recipient of ["device", "interface"]) {
    for (let request = 0; request <= 31 && !opened; request += 1) {
      for (const value of [0, 1]) {
        log(`vendor OUT ${recipient} request 0x${request.toString(16)} value ${value}`);
        try {
          const result = await device.controlTransferOut({
            requestType: "vendor",
            recipient,
            request,
            value,
            index: 0,
          });
          if (result.status !== "ok") {
            continue;
          }
          log(`  accepted (status ${result.status}) — testing the bulk pipe`);
        } catch {
          // Stalls are the expected answer and carry no information.
          continue;
        }

        const reply = await exchange(probe).catch(() => null);
        if (reply === null) {
          log("  bulk went SILENT after this request — the loopback is broken. Stopping here.");
          opened = true;
          break;
        }
        if (!isEcho(reply, probe)) {
          log(`  *** NON-ECHO REPLY: ${hex(reply)} *** this request opened the data path. Stopping here.`);
          opened = true;
          break;
        }
      }
    }
  }

  if (!opened) {
    log("sweep done: every accepted request left the bulk pipe echoing.");
  }
  usbReading = true;
  readLoop();
});

/** Parses "05 04" / "0504" / "05,04" into bytes. */
function parseHex(text) {
  const cleaned = text.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
  const bytes = [];
  for (let index = 0; index + 1 < cleaned.length + 1; index += 2) {
    const pair = cleaned.slice(index, index + 2);
    if (pair.length === 2) {
      bytes.push(Number.parseInt(pair, 16));
    }
  }
  return bytes;
}

document.getElementById("usb-send-hex").addEventListener("click", () => {
  const bytes = parseHex(document.getElementById("usb-hex").value);
  if (bytes.length === 0) {
    log("nothing to send — enter hex bytes.");
    return;
  }
  sendBulk("custom", bytes);
});

// A 64-byte packet is what the endpoint's packet size suggests the bridge may
// expect; a short transfer is a legal but different thing on the wire.
document.getElementById("usb-send-padded").addEventListener("click", () => {
  const bytes = parseHex(document.getElementById("usb-hex").value);
  const padded = new Uint8Array(64);
  padded.set(bytes.slice(0, 64));
  sendBulk("custom padded to 64", padded);
});

document.getElementById("usb-read").addEventListener("click", () => sendBulk("READ_ONE_SAMPLE", [0x05, 0x04]));
document.getElementById("usb-keepalive").addEventListener("click", () => sendBulk("KEEPALIVE", [0x00]));

document.getElementById("hid-stop").addEventListener("click", () => {
  if (hidDevice) {
    hidDevice.removeEventListener("inputreport", handleInputReport);
    log("stopped listening to", hidDevice.productName || "(unnamed HID device)");
    hidDevice = null;
  }
});

/** What the unsolicited stream looks like in aggregate. */
document.getElementById("stats").addEventListener("click", () => {
  const seconds = (performance.now() - streamStart) / 1000;
  log(`stream: ${streamCount} reports in ${seconds.toFixed(1)} s = ${(streamCount / seconds).toFixed(1)}/s`);
  log("distinct leading bytes:", Object.fromEntries(streamTally));
});

// A device already permitted in an earlier session needs no picker: dumping it
// on load is the fastest way to get the descriptor into the log.
if (navigator.hid) {
  navigator.hid.getDevices().then(async (devices) => {
    log(`already-permitted HID devices: ${devices.length}`);
    const pasco = devices.find((device) => device.vendorId === PASCO_VENDOR_ID);
    if (pasco) {
      await adopt(pasco);
    } else if (devices.length > 0) {
      log(
        "none of them is PASCO (0x0945); not adopting:",
        devices.map((device) => device.productName),
      );
    }
  });
}
