# VA Medical Evidence Processing Platform

A localized, full-stack application designed to automatically generate **medical evidence packets** for veterans. This tool streamlines the process of filling out Evidence Summary Forms (ESF), retrieving medical research, and stitching everything together into professional, compressed PDF packets.

## 🚀 Features

- **Automated ESF Filling:** Automatically checks the appropriate boxes and fills condition-specific descriptions on the official Evidence Summary Form.
- **Smart PDF Extraction:** Automatically parses Veteran details (Name, SSN) and medical conditions from an uploaded `.docx` or `.pdf` memorandum.
- **Web Scraping & CAPTCHA Evasion:** Uses an interactive headful browser to pull medical research from URLs. If a CAPTCHA is hit, the UI pauses and allows the user to solve it manually in the browser window before resuming.
- **PDF Stamping & Compression:** Stamps the Veteran's Full Name and SSN on the top-right corner of every research page. The final merged PDF is automatically compressed using Ghostscript if it exceeds 10MB.
- **Local First:** Operates entirely on your local machine using an internal Node.js queue system. No cloud database or Redis required.

---

## 💻 Prerequisites

To run this tool, you must have two pieces of software installed on your computer:

### 1. Node.js (Application Runtime)
- **Windows / Mac / Linux:** Download the official LTS installer from [Node.js Official Website](https://nodejs.org/).

### 2. Ghostscript (PDF Compression Engine)
- **Windows:** 
  - Download the installer from the [Ghostscript Downloads Page](https://ghostscript.com/releases/gsdnld.html). 
  - *Or via Chocolatey:* `choco install ghostscript`
- **Mac:**
  - *Via Homebrew:* `brew install ghostscript`
- **Linux:**
  - *Ubuntu/Debian:* `sudo apt-get install ghostscript`
  - *Arch:* `sudo pacman -S ghostscript`

---

## 🛠️ Installation & Running

This application is built as a self-contained monolith. The frontend and backend boot together automatically.

1. **Clone or Download the Repository:**
   Download this project to your computer and unzip it.

2. **Open Terminal / Command Prompt:**
   Navigate into the project folder using your terminal:
   ```bash
   cd path/to/va-evidence-tool
   ```

3. **Install Dependencies (One-time only):**
   Run the following command to install all necessary packages and build the frontend interface:
   ```bash
   npm install
   ```

4. **Start the Application:**
   Run the following command to boot up the platform:
   ```bash
   npm start
   ```

5. **Open the Website:**
   Once the terminal says `🚀 VA Evidence Monolith running on port 5000`, open your web browser and go to:
   👉 **http://localhost:5000**

---

## 📖 How to Use

1. **Upload Documents:** Drop a blank `.pdf` Evidence Summary Form (ESF) into the first box. Optionally, drop a Veteran Memorandum into the second box (the system will attempt to automatically read the Veteran's Name, SSN, and Conditions from it).
2. **Confirm Details:** The system will present the extracted data. You can manually adjust the Veteran Name, SSN, and add/remove specific conditions.
3. **Add Research:** For each condition, you can either upload your own local PDF files or paste URLs to medical research pages (e.g., PubMed).
4. **Generate Packets:** Click "Generate Packets". The system will begin downloading research and merging PDFs.
5. **Handling CAPTCHAs:** If a website blocks the download with a CAPTCHA, a Chrome browser window will pop up. Solve the CAPTCHA in the window, and then click **"I Have Solved the CAPTCHA! Continue"** in the web interface to resume the process.
6. **Download Final Packets:** Once completed, click the "Download" buttons to save the finalized, fully stamped, and compressed PDF packets!

---

## ⚙️ Architecture Notes
* **Backend:** Express.js (Port 5000)
* **Frontend:** React + Vite + Tailwind CSS (Compiled to static files)
* **Web Scraper:** Playwright (Headed Mode)
* **PDF Engine:** pdf-lib + Ghostscript
