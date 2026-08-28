/**
 * usb-probe.js
 *
 * Throwaway bring-up tool: identifies how a PASCO Wireless Geiger Counter
 * (PS-3238) presents itself over USB, so the sim's USB transport can be written
 * against fact rather than guesswork. Not part of the sim bundle.
 */

const logElement = document.getElementById("log");

function log(...parts) {
  const text = parts.map((part) => (typeof part === "string" ? part : JSON.stringify(part, null, 2))).join(" ");
  logElement.textContent += `${text}\n`;
  logElement.scrollTop = logElement.scrollHeight;
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

/** Flattens a WebHID collection tree into something readable. */
function describeCollections(collections, depth = 0) {
  return collections.map((collection) => ({
    depth,
    usagePage: `0x${collection.usagePage.toString(16)}`,
    usage: `0x${collection.usage.toString(16)}`,
    inputReports: collection.inputReports.map(describeReport),
    outputReports: collection.outputReports.map(describeReport),
    featureReports: collection.featureReports.map(describeReport),
    children: collection.children.length > 0 ? describeCollections(collection.children, depth + 1) : undefined,
  }));
}

function describeReport(report) {
  const bits = report.items.reduce((total, item) => total + item.reportSize * item.reportCount, 0);
  return { reportId: report.reportId, bytes: bits / 8, items: report.items.length };
}

let hidDevice = null;

document.getElementById("hid").addEventListener("click", async () => {
  if (!navigator.hid) {
    log("WebHID unavailable in this browser.");
    return;
  }
  // An empty filter list shows every HID device the OS will hand over.
  const devices = await navigator.hid.requestDevice({ filters: [] });
  if (devices.length === 0) {
    log("HID: nothing selected.");
    return;
  }
  for (const device of devices) {
    log("HID device:", {
      productName: device.productName,
      vendorId: `0x${device.vendorId.toString(16).padStart(4, "0")}`,
      productId: `0x${device.productId.toString(16).padStart(4, "0")}`,
      opened: device.opened,
      collections: describeCollections(device.collections),
    });
  }
  hidDevice = devices[0];
  document.getElementById("listen").disabled = false;
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

document.getElementById("known").addEventListener("click", async () => {
  if (navigator.hid) {
    const devices = await navigator.hid.getDevices();
    log(
      `HID already permitted: ${devices.length}`,
      devices.map((d) => d.productName),
    );
  }
  if (navigator.serial) {
    const ports = await navigator.serial.getPorts();
    log(
      `Serial already permitted: ${ports.length}`,
      ports.map((p) => p.getInfo()),
    );
  }
  if (navigator.usb) {
    const devices = await navigator.usb.getDevices();
    log(
      `USB already permitted: ${devices.length}`,
      devices.map((d) => d.productName),
    );
  }
});

document.getElementById("clear").addEventListener("click", () => {
  logElement.textContent = "";
});

document.getElementById("listen").addEventListener("click", async () => {
  if (!hidDevice) {
    return;
  }
  if (!hidDevice.opened) {
    await hidDevice.open();
  }
  hidDevice.addEventListener("inputreport", (event) => {
    const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    log(`<- reportId ${event.reportId} (${bytes.length}B): ${hex(bytes)}`);
  });
  log("HID device open; listening for input reports.");
  document.getElementById("read").disabled = false;
  document.getElementById("keepalive").disabled = false;
});

/** Sends a PASCO command, trying report id 0 first and then 1. */
async function sendCommand(bytes) {
  if (!hidDevice?.opened) {
    log("Open the device first.");
    return;
  }
  const outputReports = hidDevice.collections.flatMap((collection) => collection.outputReports);
  const report = outputReports[0];
  const reportId = report?.reportId ?? 0;
  const size = report
    ? report.items.reduce((t, item) => t + (item.reportSize * item.reportCount) / 8, 0)
    : bytes.length;
  const payload = new Uint8Array(Math.max(size, bytes.length));
  payload.set(bytes);
  log(`-> reportId ${reportId} (${payload.length}B): ${hex(payload)}`);
  try {
    await hidDevice.sendReport(reportId, payload);
  } catch (error) {
    log("sendReport failed:", String(error));
  }
}

document.getElementById("read").addEventListener("click", () => sendCommand([0x05, 0x04]));
document.getElementById("keepalive").addEventListener("click", () => sendCommand([0x00]));
