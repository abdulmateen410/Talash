import os
import re
import json
import time
import uuid
import base64
import hashlib
import threading
from datetime import datetime
from pathlib import Path
from functools import wraps
from flask import Flask, request, jsonify, send_file, render_template, session, redirect, url_for

from dotenv import load_dotenv
load_dotenv()

try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    EXCEL_OK = True
except ImportError:
    EXCEL_OK = False

try:
    from groq import Groq
    GROQ_OK = True
except ImportError:
    GROQ_OK = False

try:
    from PIL import Image
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    import pytesseract
    TESSERACT_OK = True
except ImportError:
    TESSERACT_OK = False

try:
    import fitz  # PyMuPDF — renders scanned PDF pages to images
    FITZ_OK = True
except ImportError:
    FITZ_OK = False

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "talash-secret-key-2026")
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

BASE_DIR   = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "output"
USERS_FILE = BASE_DIR / "users.json"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

jobs      = {}
jobs_lock = threading.Lock()

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"}

# ─── Auth helpers ─────────────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def load_users() -> dict:
    if USERS_FILE.exists():
        try:
            return json.loads(USERS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_users(users: dict):
    USERS_FILE.write_text(json.dumps(users, indent=2, ensure_ascii=False), encoding="utf-8")

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "username" not in session:
            if request.is_json or request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated

# ─── Extraction prompt ────────────────────────────────────────────────────────

PROMPT = """\
You are an expert HR CV data extraction system.

Extract ALL structured information from the CV text below.
Return ONLY valid JSON — no markdown fences, no explanation, no extra keys.

CV TEXT:
{cv_text}

Return EXACTLY this JSON structure:
{{
  "personal_info": {{
    "name":"", "father_name":"", "dob":"", "nationality":"",
    "marital_status":"", "current_salary":"", "expected_salary":"",
    "present_employment":"", "apply_date":"", "post_applied":""
  }},
  "education": [{{
    "degree":"", "level":"", "specialization":"",
    "grade_cgpa_percentage":"", "passing_year":"",
    "institution":"", "board_university":""
  }}],
  "professional_qualifications": [{{"qualification":"", "passing_year":"", "institution":""}}],
  "experience": [{{
    "post":"", "organization":"", "location":"",
    "start_date":"", "end_date":"", "duration_months":null, "employment_type":""
  }}],
  "publications": [{{
    "title":"", "author_name":"", "co_authors":"", "published_in":"",
    "impact_factor":null, "volume":"", "pages":"", "year":"", "type":""
  }}],
  "patents": [{{"patent_number":"","title":"","date":"","inventors":"","country":"","link":""}}],
  "books":   [{{"title":"","authors":"","isbn":"","publisher":"","year":"","link":""}}],
  "awards_scholarships": [{{"type":"", "detail":""}}],
  "references": [{{"name":"", "designation":"", "organization":"", "email":"", "phone":""}}]
}}

Rules:
- level must be one of: SSC | HSSC | Bachelor | Master | PhD | PostDoc | Other
- type (publications) must be: Journal | Conference
- impact_factor must be a float or null
- All missing fields = "" or null or []; no extra keys
- Extract ALL entries, do not truncate lists
"""

IMAGE_PROMPT = """\
This is a CV / resume image. Extract ALL text visible in the image exactly as it appears,
preserving structure and layout as much as possible. Include all sections:
personal info, education, experience, publications, awards, references, etc.
Output only the raw extracted text — no commentary.
"""

# ─── Text extraction ──────────────────────────────────────────────────────────

def extract_text_from_pdf(pdf_path):
    """Try pdfplumber for text-layer PDFs. Returns empty string if scanned."""
    if not PDF_OK:
        return ""
    pages = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text and text.strip():
                    pages.append(f"[PAGE {i+1}]\n{text}")
    except Exception:
        pass
    return "\n\n".join(pages)

def pdf_to_pil_images(pdf_path, dpi=250):
    """
    Render every page of a PDF to a PIL Image using PyMuPDF (fitz).
    Returns list of PIL.Image objects, or empty list if fitz unavailable.
    """
    if not FITZ_OK or not PIL_OK:
        return []
    images = []
    try:
        doc = fitz.open(pdf_path)
        mat = fitz.Matrix(dpi / 72, dpi / 72)   # scale factor for DPI
        for page in doc:
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
        doc.close()
    except Exception:
        pass
    return images

def pil_image_to_base64(img, fmt="PNG"):
    """Convert a PIL Image to a base64 string."""
    import io
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode("utf-8")

def ocr_image_tesseract(img):
    """Run Tesseract OCR on a PIL Image. Returns text string."""
    if not TESSERACT_OK:
        return ""
    try:
        # Use page-segmentation mode 1 (auto with OSD) for best layout reading
        custom_cfg = r"--oem 3 --psm 1"
        return pytesseract.image_to_string(img, lang="eng", config=custom_cfg).strip()
    except Exception:
        return ""

def ocr_image_groq_vision(client, img):
    """Send a PIL Image to Groq vision model and return extracted text."""
    if not client:
        return ""
    try:
        b64 = pil_image_to_base64(img, fmt="PNG")
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text",      "text": IMAGE_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}
                ]
            }],
            max_tokens=4096,
            temperature=0,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return ""

def extract_text_from_scanned_pdf(pdf_path, client=None):
    """
    Fallback for image-based / scanned PDFs:
    1. Render each page to a PIL Image via PyMuPDF
    2. Try Tesseract OCR first (fast, free, local)
    3. If Tesseract unavailable or yields too little text, use Groq vision
    Returns all pages joined as a single string.
    """
    page_images = pdf_to_pil_images(pdf_path)
    if not page_images:
        return ""

    all_text = []
    for i, img in enumerate(page_images):
        page_label = f"[PAGE {i+1}]"

        # --- Tesseract first ---
        text = ocr_image_tesseract(img)
        if text and len(text.strip()) > 80:
            all_text.append(f"{page_label}\n{text}")
            continue

        # --- Groq vision fallback ---
        text = ocr_image_groq_vision(client, img)
        if text:
            all_text.append(f"{page_label}\n{text}")

        # Rate-limit friendly pause between Groq calls
        if client and i < len(page_images) - 1:
            time.sleep(0.8)

    return "\n\n".join(all_text)

def extract_text_from_image_file(file_path, client=None):
    """Handle standalone image files (PNG, JPG, etc.)."""
    if not PIL_OK:
        return ""
    try:
        img = Image.open(file_path).convert("RGB")
    except Exception:
        return ""

    # Try Tesseract first
    text = ocr_image_tesseract(img)
    if text and len(text.strip()) > 80:
        return text

    # Fallback: Groq vision
    return ocr_image_groq_vision(client, img)

def extract_text_from_file(file_path, client=None):
    """
    Unified entry-point for all file types.

    PDF workflow:
      1. pdfplumber  → fast, works for text-layer PDFs
      2. If empty → scanned PDF fallback (PyMuPDF → Tesseract / Groq vision)

    Image workflow:
      1. Tesseract OCR  (local)
      2. Groq vision    (API fallback)
    """
    ext = Path(file_path).suffix.lower()

    if ext == ".pdf":
        # First try native text extraction
        text = extract_text_from_pdf(file_path)
        if text.strip():
            return text
        # PDF had no text layer → scanned pages
        return extract_text_from_scanned_pdf(file_path, client)
    else:
        return extract_text_from_image_file(file_path, client)

# ─── Candidate parsing ────────────────────────────────────────────────────────

def split_candidates(text):
    parts = re.split(r"(?=Candidate for the Post of)", text, flags=re.IGNORECASE)
    return [p.strip() for p in parts if len(p.strip()) > 150]

def regex_extract(text):
    d = {k: [] for k in ["education","professional_qualifications","experience",
                          "publications","patents","books","awards_scholarships","references"]}
    d["personal_info"] = {}
    pi = d["personal_info"]
    FLAGS = re.DOTALL | re.IGNORECASE

    def first(pattern, s=None, g=1):
        s = s or text
        m = re.search(pattern, s, FLAGS)
        return re.sub(r"\s+", " ", m.group(g)).strip() if m else ""

    pi["post_applied"]       = first(r"Candidate for the Post of (.+?) -")
    pi["apply_date"]         = first(r"Apply Date:\s*(\d{2}-\w+-\d{4})")
    name_m = re.search(r"Apply Date:[^\n]+\n+([A-Z][A-Za-z .\-\']{2,60})(?:\n|Father)", text)
    pi["name"] = name_m.group(1).strip() if name_m else first(r"Name[:\s]+([A-Z][A-Za-z .\-\']{2,60})")
    pi["father_name"]        = first(r"Father[^\n]{0,20}\n+([^\n]{2,60})")
    pi["marital_status"]     = first(r"Marital Status:\s*(\S+)")
    pi["current_salary"]     = first(r"Current Salary:\s*(\S+)")
    pi["expected_salary"]    = first(r"Expected Salary:\s*(\S+)")
    pi["present_employment"] = first(r"Present\s*Employment:\s*(.+?)(?:\n\n|Serving)")
    dob_raw = first(r"Date/Place of\s*Birth:\s*(.+?)(?:\n|Father)")
    dob_parts = [p.strip() for p in dob_raw.split("/") if p.strip()]
    if dob_parts:        pi["dob"] = dob_parts[0]
    if len(dob_parts)>1: pi["nationality"] = dob_parts[1]

    edu_m = re.search(
        r"Education\s*\nName of Degree.+?Passing Year\s+Board/University\s*\n"
        r"(.+?)(?=\nProfessional Qualification|\nCivil Experience|\nResearch|\Z)", text, re.DOTALL)
    if edu_m:
        lines = [l.strip() for l in edu_m.group(1).splitlines() if l.strip()]
        i = 0
        while i < len(lines):
            line = lines[i]; lo = line.lower()
            if re.match(r"^[\d\.\s]+$", line) or len(line) < 4:
                i += 1; continue
            level = (
                "PhD"      if any(x in lo for x in ["phd","doctor","ph.d"]) else
                "PostDoc"  if "postdoc" in lo else
                "Master"   if any(x in lo for x in ["ms ","msc","master","m.sc","m.eng","mphil","mba"]) else
                "Bachelor" if any(x in lo for x in ["bs ","bsc","bachelor","b.sc","b.e ","be ","beng","b.tech"]) else
                "HSSC"     if any(x in lo for x in ["hssc","fsc","f.sc","intermediate","a-level","ics"]) else
                "SSC"      if any(x in lo for x in ["ssc","matric","o-level","secondary"]) else "Other"
            )
            spec = inst = grade = year = ""
            j = i + 1
            while j < min(i+6, len(lines)):
                v = lines[j]
                if   re.match(r"^\d{4}$", v):          year  = v
                elif re.match(r"^[\d\.]+$", v):         grade = v
                elif len(v) > 4 and not re.match(r"^[\d\.\s]+$", v):
                    if not spec: spec = v
                    else:        inst = v
                j += 1
            d["education"].append({
                "degree": line, "level": level, "specialization": spec,
                "grade_cgpa_percentage": grade, "passing_year": year,
                "institution": inst, "board_university": inst or spec
            })
            i = j

    exp_m = re.search(
        r"Civil Experience\s*\nName of Post\s+Organization.+?\n(.+?)"
        r"(?=\nResearch|\nAwards|\nReferences|\Z)", text, re.DOTALL)
    if exp_m:
        lines = [l.strip() for l in exp_m.group(1).splitlines() if l.strip()]
        for i, line in enumerate(lines):
            dm = re.search(r"(\w{3}-\d{4})\s*-\s*(\w{3}-\d{4}|Present)", line, re.IGNORECASE)
            if dm:
                d["experience"].append({
                    "post":            lines[i-3].strip() if i >= 3 else "",
                    "organization":    lines[i-2].strip() if i >= 2 else "",
                    "location":        lines[i-1].strip() if i >= 1 else "",
                    "start_date":      dm.group(1),
                    "end_date":        dm.group(2),
                    "duration_months": None,
                    "employment_type": ""
                })

    pub_m = re.search(
        r"Publications\s*\n(?:Paper Title.+?\n)+(.+?)"
        r"(?=\nReferences|\nAwards|\nPatents|\Z)", text, re.DOTALL)
    if pub_m:
        for entry in re.split(r"\n(?=\d+\.?\s)", pub_m.group(1)):
            entry = entry.strip()
            if len(entry) < 20: continue
            pub_type = "Conference" if any(w in entry.lower() for w in
                ["conference","congress","symposium","workshop","proceedings"]) else "Journal"
            yr_m = re.search(r"(\d{4})", entry)
            if_m = re.search(r"(?:IF|Impact Factor)[\s:=]+([\d\.]+)", entry, re.IGNORECASE)
            d["publications"].append({
                "title": entry[:300], "author_name": "", "co_authors": "",
                "published_in": "", "impact_factor": float(if_m.group(1)) if if_m else None,
                "volume": "", "pages": "", "year": yr_m.group(1) if yr_m else "", "type": pub_type
            })

    aw_m = re.search(
        r"Awards\s*&?\s*\nScholarships\s*\nType\s+Detail\s*\n"
        r"(.+?)(?=\nReferences|\nPatents|\Z)", text, re.DOTALL)
    if aw_m:
        lines = [l.strip() for l in aw_m.group(1).splitlines() if l.strip()]
        for i in range(0, len(lines)-1, 2):
            d["awards_scholarships"].append({"type": lines[i], "detail": lines[i+1]})

    ref_m = re.search(r"References\s*\nName\s+Contact.*?\n(.+?)$", text, re.DOTALL)
    if ref_m:
        for email in re.findall(r"[\w.+\-]+@[\w.\-]+\.\w+", ref_m.group(1)):
            d["references"].append({"name":"","designation":"","organization":"","email":email,"phone":""})

    return d

def init_groq_client(api_key):
    if not GROQ_OK or not api_key:
        return None
    try:
        return Groq(api_key=api_key)
    except Exception:
        return None

def llm_extract(client, cv_text):
    prompt = PROMPT.format(cv_text=cv_text[:12000])
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"^```\s*$", "", raw, flags=re.MULTILINE)
        return json.loads(raw.strip())
    except Exception:
        return None

def extract_candidate(client, cv_text):
    if client:
        result = llm_extract(client, cv_text)
        if result:
            return result
    return regex_extract(cv_text)

# ─── Analysis functions ───────────────────────────────────────────────────────

def normalize_grade(grade_str):
    if not grade_str:
        return None
    clean = re.sub(r"[^\d\.]", "", grade_str)
    try:
        val = float(clean)
    except ValueError:
        return None
    if val <= 10 and val > 0:
        return round(val * 25, 2)
    return val

def educational_profile_analysis(candidate):
    edu = candidate.get("education", []) or []
    analysis = {
        "ssc_percent": None, "hssc_percent": None,
        "ug_details": {}, "pg_details": {}, "phd_details": {},
        "progression_gaps": [], "institution_rankings": {}, "overall_assessment": ""
    }
    for e in edu:
        level      = e.get("level", "").lower()
        grade_norm = normalize_grade(e.get("grade_cgpa_percentage"))
        if "ssc" in level or "matric" in level or "o-level" in level or "secondary" in level:
            analysis["ssc_percent"] = grade_norm
        elif any(x in level for x in ["hssc","fsc","inter","a-level","ics"]):
            analysis["hssc_percent"] = grade_norm
        elif any(x in level for x in ["bachelor","bs","bsc","b.sc","b.e","beng","b.tech"]):
            analysis["ug_details"] = {
                "degree": e.get("degree"), "institution": e.get("institution") or e.get("board_university"),
                "grade": grade_norm, "year": e.get("passing_year")
            }
        elif any(x in level for x in ["master","ms","msc","mphil","mba","postgrad"]):
            analysis["pg_details"] = {
                "degree": e.get("degree"), "institution": e.get("institution") or e.get("board_university"),
                "grade": grade_norm, "year": e.get("passing_year")
            }
        elif any(x in level for x in ["phd","doctor","postdoc"]):
            analysis["phd_details"] = {
                "degree": e.get("degree"), "institution": e.get("institution") or e.get("board_university"),
                "grade": grade_norm, "year": e.get("passing_year")
            }

    years = sorted([int(e.get("passing_year")) for e in edu
                    if e.get("passing_year","").isdigit()])
    for i in range(len(years)-1):
        gap = years[i+1] - years[i]
        if gap > 5:
            analysis["progression_gaps"].append(f"{gap} years between degrees")

    ranking_map = {
        "nust": {"THE": 801, "QS": 367}, "lums": {"THE": 351, "QS": 401},
        "uet lahore": {"QS": 701},       "iiu":  {"QS": 1001}, "comsats": {"QS": 801},
    }
    for key in ["ug_details", "pg_details", "phd_details"]:
        inst = analysis[key].get("institution", "").lower()
        for k, v in ranking_map.items():
            if k in inst:
                analysis["institution_rankings"][inst] = v

    if analysis["phd_details"]:
        analysis["overall_assessment"] = "Strong academic background with PhD."
    elif analysis["pg_details"]:
        analysis["overall_assessment"] = "Postgraduate degree; research potential."
    else:
        analysis["overall_assessment"] = "Undergraduate only; may require further training."

    return analysis

def experience_analysis(candidate):
    exp = candidate.get("experience", []) or []
    result = {"timeline": [], "overlaps": [], "gaps": [], "total_experience_months": 0, "justified_gaps": []}
    job_periods = []
    for e in exp:
        start = e.get("start_date"); end = e.get("end_date")
        if start and end:
            try:
                s  = datetime.strptime(start, "%b-%Y")
                ed = datetime.strptime(end,   "%b-%Y") if end.lower() != "present" else datetime.now()
                job_periods.append((s, ed, e))
            except Exception:
                pass
    job_periods.sort(key=lambda x: x[0])
    for i in range(len(job_periods)-1):
        _, prev_end, prev_e = job_periods[i]
        next_start, _, next_e = job_periods[i+1]
        if prev_end > next_start:
            result["overlaps"].append(f"Overlap: {prev_e.get('post','?')} ↔ {next_e.get('post','?')}")
        elif (next_start - prev_end).days > 30:
            result["gaps"].append({
                "start": prev_end.strftime("%Y-%m"),
                "end":   next_start.strftime("%Y-%m"),
                "days":  (next_start - prev_end).days
            })
    edu_years = [int(e.get("passing_year")) for e in candidate.get("education", [])
                 if e.get("passing_year","").isdigit()]
    for gap in result["gaps"]:
        gap_year = int(gap["start"][:4])
        if any(abs(gap_year - y) <= 1 for y in edu_years):
            result["justified_gaps"].append(gap)
    return result

def research_profile_analysis(candidate):
    pubs = candidate.get("publications", []) or []
    result = {
        "total": len(pubs), "journal_count": 0, "conference_count": 0,
        "first_author_count": 0, "corresponding_author_count": 0,
        "quartile_distribution": {"Q1": 0, "Q2": 0, "Q3": 0, "Q4": 0, "Unknown": 0},
        "top_conferences": []
    }
    for pub in pubs:
        if (pub.get("type","") or "").lower() == "journal":
            result["journal_count"] += 1
            if_val = pub.get("impact_factor")
            if isinstance(if_val, (int, float)):
                if   if_val >= 5: result["quartile_distribution"]["Q1"] += 1
                elif if_val >= 2: result["quartile_distribution"]["Q2"] += 1
                elif if_val >= 1: result["quartile_distribution"]["Q3"] += 1
                else:             result["quartile_distribution"]["Q4"] += 1
            else:
                result["quartile_distribution"]["Unknown"] += 1
        else:
            result["conference_count"] += 1
            conf = (pub.get("published_in","") or "").lower()
            if any(c in conf for c in ["icml","neurips","cvpr","iccv","acl","aaai","siggraph"]):
                result["top_conferences"].append(pub.get("published_in"))
    return result

def process_candidate_full(client, cv_text):
    candidate = extract_candidate(client, cv_text)
    candidate["_analysis"] = {
        "education":  educational_profile_analysis(candidate),
        "experience": experience_analysis(candidate),
        "research":   research_profile_analysis(candidate)
    }
    return candidate

def detect_missing(candidate):
    missing = []
    pi  = candidate.get("personal_info", {}) or {}
    edu = candidate.get("education",     []) or []
    exp = candidate.get("experience",    []) or []
    pub = candidate.get("publications",  []) or []
    if not pi.get("name"):           missing.append("Full name")
    if not edu:                      missing.append("Education records")
    if not exp:                      missing.append("Professional experience")
    if not pub:                      missing.append("Publications list")
    if not any(e.get("grade_cgpa_percentage") for e in edu):
        missing.append("Academic grades/CGPA")
    if not any(e.get("start_date") for e in exp):
        missing.append("Employment start dates")
    return missing

def draft_email(name, post, missing_fields):
    bullets = "\n".join(f"  • {f}" for f in missing_fields)
    return (
        f"Dear {name or 'Applicant'},\n\n"
        f"Thank you for applying for the position of {post or '(position)'} at SEECS, NUST.\n\n"
        f"After reviewing your submitted application, the following information was "
        f"found to be missing or incomplete:\n\n{bullets}\n\n"
        f"We kindly request you to provide these details at your earliest convenience.\n\n"
        f"Best regards,\nHR Recruitment Team\nSEECS, NUST, Islamabad"
    )

# ─── Excel export ─────────────────────────────────────────────────────────────

def write_excel(all_data, out_path):
    if not EXCEL_OK:
        return
    wb    = openpyxl.Workbook()
    HEAD  = PatternFill("solid", fgColor="1E2128")
    ACC   = PatternFill("solid", fgColor="E85D3D")
    ctr   = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin  = Border(left=Side(style="thin",color="2E333B"), right=Side(style="thin",color="2E333B"),
                   top=Side(style="thin",color="2E333B"), bottom=Side(style="thin",color="2E333B"))

    def hdr(ws):
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF", size=9)
            cell.fill = ACC; cell.alignment = ctr; cell.border = thin

    def aw(ws, mn=10, mx=40):
        for col in ws.columns:
            length = max(len(str(c.value or "")) for c in col)
            ws.column_dimensions[get_column_letter(col[0].column)].width = max(mn, min(length+2, mx))

    all_c = [(src, c) for src, cands in all_data.items() for c in cands]

    def get_deg(edu, kws):
        for e in edu:
            if any(k in (e.get("degree","")+" "+e.get("level","")).lower() for k in kws):
                return e
        return {}

    ws1 = wb.active; ws1.title = "Master Summary"
    ws1.append(["Source","Name","Post Applied","Apply Date","Present Employment",
                "Nationality","Marital Status","Current Salary","Expected Salary",
                "SSC Grade","SSC Year","HSSC Grade","HSSC Year",
                "UG Degree","UG CGPA","UG Year","UG Institution",
                "PG Degree","PG CGPA","PG Year","PG Institution",
                "PhD Degree","PhD CGPA","PhD Year","PhD Institution",
                "Total Pubs","Journals","Conferences","Avg IF","Max IF",
                "Exp Roles","Missing Fields","Email Drafted"])
    hdr(ws1)
    for src, c in all_c:
        pi  = c.get("personal_info",{}) or {}
        edu = c.get("education",[])     or []
        exp = c.get("experience",[])    or []
        pubs = c.get("publications",[]) or []
        miss = detect_missing(c)
        ssc  = get_deg(edu, ["ssc","matric","o-level","secondary"])
        hssc = get_deg(edu, ["hssc","fsc","f.sc","intermediate","a-level","ics"])
        bs   = get_deg(edu, ["bs ","bsc","bachelor","b.sc","b.e ","beng","b.tech"])
        ms_  = get_deg(edu, ["ms ","msc","master","m.sc","m.eng","mphil","mba"])
        phd  = get_deg(edu, ["phd","doctor","ph.d"])
        ifs  = [p.get("impact_factor") for p in pubs if p.get("impact_factor")]
        ws1.append([
            os.path.basename(src), pi.get("name",""), pi.get("post_applied",""),
            pi.get("apply_date",""), pi.get("present_employment",""),
            pi.get("nationality",""), pi.get("marital_status",""),
            pi.get("current_salary",""), pi.get("expected_salary",""),
            ssc.get("grade_cgpa_percentage",""),  ssc.get("passing_year",""),
            hssc.get("grade_cgpa_percentage",""), hssc.get("passing_year",""),
            bs.get("degree",""), bs.get("grade_cgpa_percentage",""), bs.get("passing_year",""),
            bs.get("institution","") or bs.get("board_university",""),
            ms_.get("degree",""), ms_.get("grade_cgpa_percentage",""), ms_.get("passing_year",""),
            ms_.get("institution","") or ms_.get("board_university",""),
            phd.get("degree",""), phd.get("grade_cgpa_percentage",""), phd.get("passing_year",""),
            phd.get("institution","") or phd.get("board_university",""),
            len(pubs), sum(1 for p in pubs if (p.get("type") or "")=="Journal"),
            sum(1 for p in pubs if (p.get("type") or "")=="Conference"),
            round(sum(ifs)/len(ifs),2) if ifs else "",
            round(max(ifs),2) if ifs else "",
            len(exp), "; ".join(miss), "Yes" if miss else "No"
        ])
    aw(ws1); ws1.freeze_panes = "A2"

    ws_edu = wb.create_sheet("Education Analysis")
    ws_edu.append(["Source","Name","SSC %","HSSC %","UG Institution","UG Grade",
                   "PG Institution","PG Grade","PhD Institution","Rankings","Assessment"])
    hdr(ws_edu)
    for src, c in all_c:
        pi = c.get("personal_info",{}) or {}
        a  = c.get("_analysis",{}).get("education",{})
        ws_edu.append([
            os.path.basename(src), pi.get("name",""),
            a.get("ssc_percent",""), a.get("hssc_percent",""),
            a.get("ug_details",{}).get("institution",""), a.get("ug_details",{}).get("grade",""),
            a.get("pg_details",{}).get("institution",""), a.get("pg_details",{}).get("grade",""),
            a.get("phd_details",{}).get("institution",""),
            str(a.get("institution_rankings",{})), a.get("overall_assessment","")
        ])
    aw(ws_edu)

    ws_exp = wb.create_sheet("Experience Analysis")
    ws_exp.append(["Source","Name","Overlaps","Gaps","Justified Gaps"])
    hdr(ws_exp)
    for src, c in all_c:
        pi = c.get("personal_info",{}) or {}
        a  = c.get("_analysis",{}).get("experience",{})
        ws_exp.append([
            os.path.basename(src), pi.get("name",""),
            "; ".join(a.get("overlaps",[])), str(a.get("gaps",[])), str(a.get("justified_gaps",[]))
        ])
    aw(ws_exp)

    ws_res = wb.create_sheet("Research Analysis")
    ws_res.append(["Source","Name","Total Pubs","Journals","Conferences",
                   "Q1","Q2","Q3","Q4","Unknown","Top Conferences"])
    hdr(ws_res)
    for src, c in all_c:
        pi = c.get("personal_info",{}) or {}
        a  = c.get("_analysis",{}).get("research",{})
        q  = a.get("quartile_distribution",{})
        ws_res.append([
            os.path.basename(src), pi.get("name",""),
            a.get("total",0), a.get("journal_count",0), a.get("conference_count",0),
            q.get("Q1",0), q.get("Q2",0), q.get("Q3",0), q.get("Q4",0), q.get("Unknown",0),
            "; ".join(a.get("top_conferences",[]))
        ])
    aw(ws_res)
    wb.save(out_path)

# ─── Job runner ───────────────────────────────────────────────────────────────

def run_extraction_job(job_id, file_paths, api_key):
    client = init_groq_client(api_key)
    all_data, all_flat = {}, []
    total = 0

    with jobs_lock:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["log"]    = []

    def log(msg):
        with jobs_lock:
            jobs[job_id]["log"].append(msg)

    try:
        for fpath in file_paths:
            fname = os.path.basename(fpath)
            ext   = Path(fpath).suffix.lower()
            log(f"Reading {fname}")

            text = extract_text_from_file(fpath, client)
            if not text.strip():
                log(f"⚠ {fname} — no text could be extracted (check Tesseract or Groq key)"); continue
            log(f"✓ Text extracted from {fname} ({len(text)} chars)")

            is_image = ext != ".pdf"
            if is_image:
                # Treat the whole image as one candidate
                sections = [text]
                log(f"Image file — treating as single candidate")
            else:
                sections = split_candidates(text)
                log(f"Found {len(sections)} candidate(s) in {fname}")

            candidates = []
            for idx, section in enumerate(sections, 1):
                log(f"Extracting candidate {idx}/{len(sections)}")
                result = process_candidate_full(client, section)
                if result:
                    miss  = detect_missing(result)
                    name  = (result.get("personal_info") or {}).get("name", "(unnamed)")
                    result["_source"]  = fname
                    result["_missing"] = miss
                    result["_email"]   = draft_email(
                        name, (result.get("personal_info") or {}).get("post_applied",""), miss
                    ) if miss else ""
                    candidates.append(result)
                    all_flat.append(result)
                    total += 1
                    log(f"✓ Extracted: {name}")
                else:
                    log(f"✗ Failed section {idx}")
                if client: time.sleep(0.5)

            if candidates:
                all_data[fpath] = candidates

            with jobs_lock:
                jobs[job_id]["progress"] = total

        ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
        xlsx_name = f"talash_{ts}.xlsx"
        json_name = f"talash_{ts}.json"
        xlsx_path = str(OUTPUT_DIR / xlsx_name)
        json_path = str(OUTPUT_DIR / json_name)

        if all_data:
            write_excel(all_data, xlsx_path)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(all_flat, f, indent=2, ensure_ascii=False)
            log(f"✓ Saved {xlsx_name}")
        else:
            xlsx_path = json_path = ""
            log("No data extracted")

        stats = {
            "total":    len(all_flat),
            "phd":      sum(1 for c in all_flat if any(
                            e.get("level","").lower() == "phd"
                            for e in (c.get("education") or []))),
            "with_pub": sum(1 for c in all_flat if c.get("publications")),
            "missing":  sum(1 for c in all_flat if c.get("_missing")),
        }

        with jobs_lock:
            jobs[job_id].update({
                "status": "done", "candidates": all_flat, "total": total,
                "xlsx": xlsx_name if xlsx_path else "",
                "json": json_name if json_path else "",
                "stats": stats,
            })
        log(f"Done — {total} candidate(s) extracted")

    except Exception as e:
        with jobs_lock:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"]  = str(e)
        log(f"Fatal error: {e}")

# ─── Routes — Auth ────────────────────────────────────────────────────────────

@app.route("/login", methods=["GET"])
def login_page():
    if "username" in session:
        return redirect(url_for("index"))
    return render_template("login.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    users = load_users()
    user  = users.get(username)
    if not user or user["password"] != hash_password(password):
        return jsonify({"error": "Invalid credentials"}), 401
    session["username"] = username
    session["display"]  = user.get("display", username)
    return jsonify({"ok": True, "display": session["display"]})

@app.route("/api/signup", methods=["POST"])
def api_signup():
    data     = request.get_json() or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    display  = (data.get("display")  or username).strip()
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if not re.match(r"^[a-z0-9_]{3,32}$", username):
        return jsonify({"error": "Username: 3-32 chars, letters/digits/underscore"}), 400
    users = load_users()
    if username in users:
        return jsonify({"error": "Username already taken"}), 409
    users[username] = {"password": hash_password(password), "display": display,
                       "created": datetime.now().isoformat()}
    save_users(users)
    session["username"] = username
    session["display"]  = display
    return jsonify({"ok": True, "display": display})

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/me")
def api_me():
    if "username" in session:
        return jsonify({"username": session["username"], "display": session.get("display","")})
    return jsonify({"username": None})

# ─── Routes — App ─────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def index():
    return render_template("index.html")

@app.route("/api/upload", methods=["POST"])
@login_required
def upload():
    files   = request.files.getlist("files")
    api_key = os.environ.get("GROQ_API_KEY", "")

    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files provided"}), 400

    job_id     = str(uuid.uuid4())[:8]
    file_paths = []

    for f in files:
        ext = Path(f.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
        safe = re.sub(r"[^\w\-.]", "_", f.filename)
        dest = UPLOAD_DIR / f"{job_id}_{safe}"
        f.save(str(dest))
        file_paths.append(str(dest))

    if not file_paths:
        return jsonify({"error": "No valid files (PDF/PNG/JPG supported)"}), 400

    with jobs_lock:
        jobs[job_id] = {
            "status": "queued", "progress": 0, "total": 0,
            "candidates": [], "stats": {}, "log": [],
            "xlsx": "", "json": "", "error": ""
        }

    t = threading.Thread(target=run_extraction_job, args=(job_id, file_paths, api_key), daemon=True)
    t.start()
    return jsonify({"job_id": job_id})

@app.route("/api/status/<job_id>")
@login_required
def status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify({
        "status":   job["status"],   "progress": job["progress"],
        "total":    job["total"],    "log":      job["log"][-20:],
        "stats":    job["stats"],    "xlsx":     job["xlsx"],
        "json":     job["json"],     "error":    job["error"],
    })

@app.route("/api/candidates/<job_id>")
@login_required
def candidates(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job.get("candidates", []))

@app.route("/api/download/<filename>")
@login_required
def download(filename):
    safe = re.sub(r"[^\w\-.]", "", filename)
    path = OUTPUT_DIR / safe
    if not path.exists():
        return jsonify({"error": "File not found"}), 404
    return send_file(str(path), as_attachment=True)

@app.route("/api/mode")
def extraction_mode():
    api_key = os.environ.get("GROQ_API_KEY", "")
    client  = init_groq_client(api_key)
    return jsonify({
        "llm_available":       client is not None,
        "tesseract_available": TESSERACT_OK,
        "fitz_available":      FITZ_OK,
        "image_support":       PIL_OK or (client is not None),
        "scanned_pdf_support": FITZ_OK and (TESSERACT_OK or client is not None),
    })

if __name__ == "__main__":
    print("=" * 50)
    print("  TALASH  CV Extraction System (Milestone 2)")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000, use_reloader=False)