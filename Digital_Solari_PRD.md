# 📑 Production PRD: Digital Solari (v1.0)

## 1. Product Concept
A high-fidelity, web-based digital split-flap display system (Receiver) and a mobile web remote (Sender). The product replicates the mechanical soul of a physical Solari board (like Vestaboard) with zero-friction connectivity (no accounts/DB) and strict physical animation constraints.

---

## 2. Visual Identity & Assets
### 2.1 Aesthetic Specs
* **Board Background/Casing:** **Eerie Black (#1B1B1B)**.
* **Tile Design:** Each of the 132 modules features a subtle, **1px horizontal static line** across the center to simulate the "flap seam."
* **Color Blocks:** The 7 color characters (ROYGBPW) must render as **pure, solid blocks of color** filling the entire tile [cite: 1.1].
* **Typography:** **Vintage Solari Style.** Use the **[Split-Flap Font](https://splitflaptv.com/blog/split-flap-font/)** to mimic physical plastic-molded characters [cite: 1.1, 3.1].

### 2.2 Audio Engine
* **Asset:** **[pragotron_split-flap-display.wav](https://freesound.org/s/174056/)** [cite: 2.3].
* **Logic:** A single, continuous mechanical "clacking" audio loop. 
    * **Trigger:** Starts the millisecond the first flap begins to move.
    * **Halt:** Stops immediately when the final flap in the transition reaches its target state.

---

## 3. Core Mechanical Logic
### 3.1 The Grid
* **Layout:** 6 Rows × 22 Columns (Total: 132 Characters).

### 3.2 The Character Spool
Tiles **cannot** scramble randomly. They must cycle sequentially through this exact array:
`const SPOOL = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+=;:'"%,.?/°ROYGBPW";`

### 3.3 Animation Physics
* **Motion:** **Simultaneous & Constant Velocity.** All changing tiles begin flipping at the same time and move at a steady mechanical speed (no easing) [cite: 1.1].
* **Stepping:** To move from 'A' to 'D', the tile must render 'B' and 'C' frames in sequence.

---

## 4. Website Features (Display Board)
### 4.1 Home Page & Demo Mode
* **Auto-Play:** On load, the board cycles through three designs:
    1. `"IMPOSSIBLE IS NOTHING" - ADIDAS` (Quote-aligned).
    2. `"IN REAL LIFE, I ASSURE YOU, THERE IS NO SUCH THING AS ALGEBRA." - FRAN LEBOWITZ`.
    3. `SCAN THE QRCODE AND TRY YOURSELF`.
* **Demo Controls:** [Skip] (Advances loop & enables sound), [Mute/Unmute], [Fullscreen].
* **Live Counter:** Top-left corner; displays **"🟢 [X] BOARDS LIVE"**. Tracks actively paired TV-to-Phone WebSocket sessions only.

### 4.2 Connection & Approval
* **Handshake:** Generates a 6-digit alphanumeric code (Excluding: 0, O, 1, I) and a QR Code.
* **QR Routing:** Scanning the QR embeds the code in the URL, bypassing manual entry and landing the user on the Controller UI.
* **Approval UI:** Minimalist digital overlay: **APPROVE? [ENTER] / REJECT? [ESC]**. Resolvable via TV-connected keyboard.
* **Hijack Protection:** If a board is active, new connection attempts return a **"Board Occupied"** error to the second phone.

---

## 5. Mobile Controller UI
### 5.1 Message Editor
* **Manual Entry:** 6 separate text inputs (Row 1–6), hard-limited to 22 characters each.
* **Board Preview:** A static preview at the top of the "Messages" section that scrolls with the content.
* **Input Constraints:** System keyboard triggers; JS forces uppercase; unsupported characters/emojis convert to `?`.
* **Color Picker:** Buttons for ROYGBPW emojis insert the solid color character into the text string.
* **Multi-Message:** Add up to **10 messages**. "Add" button turns gray at limit. Each box has an **"X" delete icon**.

### 5.2 Operating Modes
* **Message Mode:** Standard loop operation. Loop timer default: **7 seconds** (Slider adjustable: 5s–60s).
* **Clock Mode:** Disables [Play]. Board layout: Row 2 (Day/Month/Date), Row 3 (HH:MM:SS AM/PM), Row 4 (Year). Only changing second-digits flip.
* **Toggling:** Switching from Clock back to Message Mode instantly flips the board to the **"DEVICE CONNECTED"** standby screen.

### 5.3 Global Controls (Sticky Footer)
* **Play:** Commences the message loop.
* **Next:** Skips the 7s timer and immediately flips to the next message.
* **Reset (Hard Reset):** Clears TV to blank Eerie Black and resets Phone UI to "HELLO WORLD" defaults.

---

## 6. Technical Infrastructure
* **Server:** Single Node.js instance using `ws` (WebSockets).
* **State:** 100% In-memory. Auto-purges sessions after 24 hours of inactivity.
* **Connectivity (Option A):** Strict Presence. If the phone socket closes (screen lock/sleep), the TV flips to **"DISCONNECTED"**. Re-opening the phone resumes the session exactly where it left off.
* **Persistence:** `localStorage` on Mobile (saves draft messages) and TV (remembers last paired ID for auto-reconnect during network blips).
