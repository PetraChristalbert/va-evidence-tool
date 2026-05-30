# VA Medical Evidence Packet Builder
**A simple tool for office workers to automatically generate medical research packets.**

This tool does all the heavy lifting for you. You give it a Veteran's Memorandum, and it automatically reads their name, SSN, and medical conditions. It then downloads the required medical research and stitches it together into a single, clean PDF that is ready to submit.

---

## 🛠️ Step 1: One-Time Setup (Do this only once!)

Before you can use this tool, your computer needs two standard programs installed. You only have to do this once.

### 1. Install Node.js (The Engine)
This is the engine that runs the tool.
* Go to the official website: [Download Node.js here](https://nodejs.org/en/download/)
* Click the big green button that says **"LTS"** (Recommended for most users).
* Open the downloaded file and click "Next" through the installer until it finishes.

### 2. Install Ghostscript (The PDF Compressor)
This shrinks the final PDFs so they are small enough (under 10MB) to upload to the VA system.
* **Windows Users:** Go to the [Ghostscript Download Page](https://ghostscript.com/releases/gsdnld.html), download the "Ghostscript AGPL Release" for Windows (64-bit), and click "Next" through the installer.
* **Mac Users:** Open your "Terminal" app and type `brew install ghostscript`, then press Enter.

---

## 🚀 Step 2: How to Start the App

You do not need to know any code to run this. Just follow these steps:

1. **Download this Tool:** Click the green **"Code"** button at the top right of this GitHub page, and select **"Download ZIP"**.
2. **Unzip it:** Extract the folder to somewhere you can easily find it, like your Desktop.
3. **Run It:**
   * **If you are on Windows:** Double-click the file named `run_windows.bat`. 
   * **If you are on Mac/Linux:** Double-click the file named `run_mac_linux.sh` (or open a terminal in that folder and type `sh run_mac_linux.sh`).
4. **Wait a moment:** A black box (terminal) will pop up. It will automatically install everything it needs. 
5. **Open the Website:** Your web browser will automatically open to `http://localhost:5000`. This is your private, secure, local workspace!

*(Note: Keep the black terminal box open while you are using the app. When you are done for the day, just close the black box to turn the app off).*

---

## 📖 Step 3: How to Use the App

1. **Upload Documents:** Drag and drop your blank Evidence Summary Form (ESF) into the first box. Drag the Veteran's Memorandum into the second box.
2. **Review the Data:** The app will automatically read the memorandum. It will show you the Veteran's Name, SSN, and the medical conditions it found. Make sure they are correct.
3. **Add Links:** For each condition, paste the URL link to the medical research (like a PubMed article). 
4. **Generate:** Click the big "Generate Packets" button.
5. **Security Checks (CAPTCHAs):** If a website thinks you are a robot and throws up a "Verify you are human" check, a Chrome window will pop up. Just click the checkbox in that window to prove you are human, and then click the green **"I Have Solved the CAPTCHA"** button in our app to continue!
6. **Download:** When it finishes, click the Download button next to each condition to get your fully-stamped, compressed PDF packet.
