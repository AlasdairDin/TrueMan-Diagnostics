# Modbus Web Dashboard

This is a dynamic HTML + JavaScript front-end interface designed to interact with Modbus-capable devices over a BLE (Bluetooth Low Energy) transport layer. The page queries for register labels and values, then displays them in a tabular format, updating regularly for live status monitoring.

## 🔧 Features

- Automatically fetches and renders **register labels** and **values** from a Modbus device
- Robust handling of **chunked BLE responses**
- Optimized polling only for values (labels fetched once)
- Manual **refresh button** to reload register labels
- Clean two-column UI: `Key` and `Value`
- Polling safely paused when refreshing labels

## 📡 Modbus Device List

These device names can be used in BLE requests (e.g., `dev=1;`) to target specific hardware:

| ID  | Device       |
|-----|--------------|
| 0   | Controller   |
| 1   | Bldc1        |
| 2   | Bldc2        |
| 3   | Bldc3        |
| 4   | Brush1       |
| 5   | Brush2       |
| 6   | Stepper1     |
| 7   | Stepper2     |
| 8   | Linak1       |
| 9   | Linak2       |
| 10  | Hopper       |
| 11  | Elevator     |
| 12  | EleBoard     |
| 13  | LedServer    |
| 14  | LedPanel11   |

Update the `DEVICE_NAME` constant in the script to select the appropriate device:

```javascript
const DEVICE_NAME = 'Bldc1'; // change to target another Modbus device
```

🧠 Internal Workflow
On page load:

Sends GET /getModbusRegText to receive and render the labels

Once labels are received:

Starts polling every 5s with GET /getModbusRegValue

Values are matched by index and populated in the table

Refresh Labels button:

Pauses polling, reloads labels, then resumes polling

📂 Integration Notes
This script is intended to run inside an HTML container, included by a parent index.html

It expects sendBLE(packet) to be available globally

BLE responses must be routed into _modbusHandlers[] array for parsing

Made with 🧠 + 🔌 for Modbus monitoring!