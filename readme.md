# ⚙️ Modbus BLE Web Interface

This project is a web-based interface for interacting with Modbus devices via BLE using Nordic UART Service.

---
Connect -> Console -> Control -> Modbus Tables

## 📡 Modbus Page

### Overview
The Modbus page dynamically loads register labels and values for a selected Modbus device.

### Internal Workflow

- **On page load**:
  - Sends `GET /getModbusRegText` over BLE to retrieve Modbus labels
- **Once labels are received**:
  - Table is built with labels in the Key column
  - Starts polling every 5 seconds with `GET /getModbusRegValue`
- **Each value poll**:
  - Returns a list of `&`-delimited register values
  - Values are mapped to the label table row by their index
- **Refresh Labels** button:
  - Temporarily stops polling
  - Sends `GET /getModbusRegText` again
  - Rebuilds the label table
  - Resumes polling after completion

---

## 🔌 BLE Integration (Nordic UART)

All device communication happens over BLE via the Nordic UART Service.

### Expected BLE Hook
The interface relies on a global method:

```javascript
window.sendBLE(packet);
```

All BLE responses must be routed through:

```javascript
window._modbusHandlers.push(handlerFunction);
```

Packets follow this format:
```
ht GET /getModbusRegText HTTP/1.1^Content-Length: 5^Content-Type: text/plain^^dev=1;
```

Responses are streamed in chunks and parsed in a debounce-controlled buffer to handle partial responses gracefully.

---

## 🔧 Connection Control Page

Provides manual connection management to BLE devices:

- Displays available BLE devices
- Initiates or terminates connections
- Shows BLE status and errors

### Features:
- Calls `navigator.bluetooth.requestDevice(...)`
- Ensures the Nordic UART Service is connected
- Handles reconnection logic if needed

---

## 🧾 Console Page

A raw terminal interface to directly send and receive UART messages over BLE.

- Input is transmitted directly to the BLE device
- Responses appear in a scrolling console log
- Useful for debugging or manual command execution

---

## 🧠 Modbus Device List

```
0:  Controller
1:  Bldc1
2:  Bldc2
3:  Bldc3
4:  Brush1
5:  Brush2
6:  Stepper1
7:  Stepper2
8:  Linak1
9:  Linak2
10: Hopper
11: Elevator
12: EleBoard
13: LedServer
14: LedPanel11
```

---

## 📂 Integration Notes

- This script is intended to be **included inside a container page**, not as a standalone file
- Requires **BLE support** in the browser (e.g., Chrome)
- Can be hosted locally or embedded within a web app UI
