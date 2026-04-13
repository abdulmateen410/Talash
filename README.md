# TALASH — CV Extraction Web Application
### CS 417: Large Language Models · SEECS, NUST · Spring 2026

> **Talent Acquisition & Learning Automation for Smart Hiring**  
> Milestone 1: Preprocessing Module — Upload → Extract → Analyse

---

## What This Does

Upload one or more PDF files containing CV applications (in the SEECS/NUST format).  
The system:
1. Extracts text from each PDF using `pdfplumber`
2. Splits multi-candidate PDFs into individual sections
3. Extracts structured data via **Groq LLM** (or regex fallback)
4. Displays all candidates in a dashboard with charts
5. Detects missing fields and drafts personalised emails
6. Exports a **7-sheet Excel file** + **JSON** for download

---

## Project Structure

```
talash/
├── app.py               ← Flask backend (all extraction logic)
├── requirements.txt     ← Python dependencies
├── templates/
│   └── index.html       ← Full frontend (dashboard, upload, candidates, emails)
├── uploads/             ← Temporary PDF storage (auto-created)
└── output/              ← Excel + JSON output (auto-created)
```

---

## How to Run Locally

### Step 1 — Clone / download
```bash
git clone https://github.com/YOUR_USERNAME/talash.git
cd talash
```

### Step 2 — Create a virtual environment
```bash
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS / Linux:
source venv/bin/activate
```

### Step 3 — Install dependencies
```bash
pip install -r requirements.txt
```

### Step 4 — Run the app
```bash
python app.py
```

### Step 5 — Open in browser
```
http://localhost:5000
```

---

## Usage

1. Go to **Upload CVs** in the sidebar
2. *(Optional)* Paste your free **Groq API key** (get one at https://console.groq.com)  
   — Without a key, fast regex extraction is used as fallback
3. Drag & drop one or more `.pdf` files (the NUST HR application format)
4. Click **Process All** and watch the real-time log
5. When done, download the **Excel** (7 sheets) or **JSON** file
6. Browse **Candidates** to inspect individual profiles
7. Check **Draft Emails** for auto-generated missing-info emails

---

## API Key Notes

| Mode | Quality | Speed | Limit |
|---|---|---|---|
| Groq LLM (`llama-3.3-70b-versatile`) | ★★★★★ | Medium | 100k tokens/day free |
| Regex Fallback | ★★★ | Fast | No limit |

If you hit Groq rate limits on large batches (43+ candidates), the system automatically falls back to regex for that candidate — no crash, no data loss.

---

## Excel Output — 7 Sheets

| Sheet | Contents |
|---|---|
| Master Summary | One row per candidate — all key fields flattened |
| Personal Info | Name, DOB, salary, employment status |
| Education | All degree records per candidate |
| Experience | All job history records |
| Publications | Full publication list with impact factors |
| Awards & Patents | Awards, scholarships, patents |
| Missing Info & Emails | Missing fields + full draft email text |

---

## GitHub Setup (Push to GitHub)

### First time
```bash
git init
git add .
git commit -m "feat: TALASH Milestone 1 - CV extraction web app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/talash.git
git push -u origin main
```

### Subsequent pushes
```bash
git add .
git commit -m "your message here"
git push
```

### Recommended `.gitignore`
Create a file called `.gitignore` with:
```
venv/
__pycache__/
*.pyc
uploads/
output/
.env
*.xlsx
*.json
```

---

## Environment Variable (optional)

Instead of pasting the API key in the UI every time, you can set it as an environment variable:

```bash
# Windows
set GROQ_API_KEY=gsk_your_key_here

# macOS / Linux
export GROQ_API_KEY=gsk_your_key_here
```

Then in `app.py` line ~17, add:
```python
DEFAULT_API_KEY = os.environ.get("GROQ_API_KEY", "")
```
And pass it as default value to the upload endpoint.

---

## Milestone 1 Checklist

- ✅ Preprocessing Module (PDF → structured data)
- ✅ LLM extraction via Groq API + regex fallback
- ✅ 7-sheet Excel output + JSON output
- ✅ Missing info detection + personalized email drafts
- ✅ Multi-candidate PDF splitting
- ✅ Web UI matching wireframes (Dashboard, Upload, Candidates, Emails)
- ✅ Real-time processing log with progress bars
- ✅ Charts: publication breakdown + qualification distribution
- ✅ Candidate detail view with tabbed sections
- ✅ Rate-limit resilient (auto-fallback to regex)

---

## Team
**Project:** TALASH — Talent Acquisition & Learning Automation for Smart Hiring  
**Course:** CS 417 Large Language Models · SEECS, NUST · Spring 2026  
**Instructor:** Dr. Muhammad Moazam Fraz
