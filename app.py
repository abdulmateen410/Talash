"""
TALASH — CV Extraction Web Application
Flask backend: upload PDF → extract structured data → download Excel/JSON
"""

import os, re, json, time, uuid, threading
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_file, render_template

# ── Optional imports (graceful fallback) ──────────────────────────────────────
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

# ── App Setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB

BASE_DIR    = Path(__file__).parent
UPLOAD_DIR  = BASE_DIR / "uploads"
OUTPUT_DIR  = BASE_DIR / "output"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# In-memory job store  {job_id: {status, progress, total, candidates, files, error}}
jobs: dict = {}
jobs_lock = threading.Lock()

# ── LLM Prompt ────────────────────────────────────────────────────────────────
PROMPT = """\
You are an expert HR CV data extraction system for SEECS, NUST Pakistan.

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

# ── PDF Extraction ─────────────────────────────────────────────────────────────
def extract_text_from_pdf(pdf_path: str) -> str:
    if not PDF_OK:
        return ""
    pages = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text and text.strip():
                    pages.append(f"[PAGE {i+1}]\n{text}")
    except Exception as e:
        app.logger.error(f"PDF error: {e}")
    return "\n\n".join(pages)


def split_candidates(text: str) -> list:
    """Split multi-candidate PDF into individual sections."""
    parts = re.split(r"(?=Candidate for the Post of)", text, flags=re.IGNORECASE)
    return [p.strip() for p in parts if len(p.strip()) > 150]


# ── Regex Fallback Extractor ───────────────────────────────────────────────────
def regex_extract(text: str) -> dict:
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

    # Education
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
                if   re.match(r"^\d{4}$", v):           year  = v
                elif re.match(r"^[\d\.]+$", v):          grade = v
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

    # Experience
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

    # Publications
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

    # Awards
    aw_m = re.search(
        r"Awards\s*&?\s*\nScholarships\s*\nType\s+Detail\s*\n"
        r"(.+?)(?=\nReferences|\nPatents|\Z)", text, re.DOTALL)
    if aw_m:
        lines = [l.strip() for l in aw_m.group(1).splitlines() if l.strip()]
        for i in range(0, len(lines)-1, 2):
            d["awards_scholarships"].append({"type": lines[i], "detail": lines[i+1]})

    # References (email only)
    ref_m = re.search(r"References\s*\nName\s+Contact.*?\n(.+?)$", text, re.DOTALL)
    if ref_m:
        for email in re.findall(r"[\w.+\-]+@[\w.\-]+\.\w+", ref_m.group(1)):
            d["references"].append({"name":"","designation":"","organization":"","email":email,"phone":""})

    return d


# ── LLM Extraction ────────────────────────────────────────────────────────────
def init_groq_client(api_key: str):
    if not GROQ_OK or not api_key:
        return None
    try:
        return Groq(api_key=api_key)
    except Exception:
        return None


def llm_extract(client, cv_text: str) -> dict | None:
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
    except Exception as e:
        app.logger.warning(f"LLM error: {e}")
        return None


def extract_candidate(client, cv_text: str) -> dict:
    if client:
        result = llm_extract(client, cv_text)
        if result:
            return result
    return regex_extract(cv_text)


# ── Missing Info Detection ─────────────────────────────────────────────────────
def detect_missing(candidate: dict) -> list:
    missing = []
    pi  = candidate.get("personal_info",  {}) or {}
    edu = candidate.get("education",       []) or []
    exp = candidate.get("experience",      []) or []
    pub = candidate.get("publications",    []) or []
    if not pi.get("name"):                                    missing.append("Full name")
    if not edu:                                               missing.append("Education records")
    elif not any(e.get("grade_cgpa_percentage") for e in edu): missing.append("Academic grades / CGPA")
    elif not any(e.get("passing_year") for e in edu):          missing.append("Degree completion years")
    if not exp:                                               missing.append("Professional experience history")
    elif not any(e.get("start_date") for e in exp):           missing.append("Employment dates")
    if not pub:                                               missing.append("Publications list")
    return missing


def draft_email(name: str, post: str, missing_fields: list) -> str:
    bullets = "\n".join(f"  • {f}" for f in missing_fields)
    return (
        f"Dear {name or 'Applicant'},\n\n"
        f"Thank you for applying for the position of {post or '(position)'} at SEECS, NUST.\n\n"
        f"After reviewing your submitted application, the following information was "
        f"found to be missing or incomplete:\n\n{bullets}\n\n"
        f"We kindly request you to provide these details and resubmit your updated CV "
        f"at your earliest convenience.\n\n"
        f"Best regards,\nHR Recruitment Team\nSEECS, NUST, Islamabad"
    )


# ── Publication Stats ──────────────────────────────────────────────────────────
def pub_stats(candidate: dict) -> dict:
    pubs     = candidate.get("publications", []) or []
    journals = [p for p in pubs if "journal"    in str(p.get("type","")).lower()]
    confs    = [p for p in pubs if "conference" in str(p.get("type","")).lower()]
    ifs = []
    for p in pubs:
        try:
            v = p.get("impact_factor")
            if v and str(v) not in ["0","0.0","","null","None"]:
                ifs.append(float(v))
        except (ValueError, TypeError):
            pass
    return {
        "total":       len(pubs),
        "journals":    len(journals),
        "conferences": len(confs),
        "avg_if":      round(sum(ifs)/len(ifs), 2) if ifs else None,
        "max_if":      round(max(ifs), 2)           if ifs else None,
    }


# ── Excel Writer ──────────────────────────────────────────────────────────────
def write_excel(all_data: dict, out_path: str):
    if not EXCEL_OK:
        return

    wb = openpyxl.Workbook()

    # Styles
    H = Font(bold=True, color="FFFFFF", size=10)
    HEAD_FILL = PatternFill("solid", fgColor="1E2128")
    ACCENT_FILL = PatternFill("solid", fgColor="E85D3D")
    ALT_FILL = PatternFill("solid", fgColor="22262C")
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left   = Alignment(horizontal="left",   vertical="center", wrap_text=True)
    thin   = Border(
        left=Side(style="thin", color="2E333B"),
        right=Side(style="thin", color="2E333B"),
        top=Side(style="thin", color="2E333B"),
        bottom=Side(style="thin", color="2E333B"),
    )

    def style_header_row(ws, row=1):
        for cell in ws[row]:
            cell.font      = Font(bold=True, color="FFFFFF", size=9)
            cell.fill      = ACCENT_FILL
            cell.alignment = center
            cell.border    = thin

    def auto_width(ws, min_w=10, max_w=40):
        for col in ws.columns:
            length = max(len(str(c.value or "")) for c in col)
            ws.column_dimensions[get_column_letter(col[0].column)].width = max(min_w, min(length + 2, max_w))

    # Collect all candidates flat
    all_candidates = []
    for src, cands in all_data.items():
        for c in cands:
            all_candidates.append((src, c))

    # ── Sheet 1: Master Summary ────────────────────────────────────────────────
    ws1 = wb.active
    ws1.title = "Master Summary"

    def get_deg(edu_list, kws):
        for e in edu_list:
            if any(k in (e.get("degree","") + " " + e.get("level","")).lower() for k in kws):
                return e
        return {}

    cols1 = [
        "Source File","Name","Post Applied","Apply Date","Present Employment",
        "Nationality","Marital Status","Current Salary","Expected Salary",
        "SSC Grade","SSC Year","HSSC Grade","HSSC Year",
        "UG Degree","UG CGPA","UG Year","UG Institution",
        "PG Degree","PG CGPA","PG Year","PG Institution",
        "PhD Degree","PhD CGPA","PhD Year","PhD Institution",
        "Total Pubs","Journals","Conferences","Avg IF","Max IF",
        "Experience Roles","Missing Fields","Email Drafted"
    ]
    ws1.append(cols1)
    style_header_row(ws1)

    for src, c in all_candidates:
        pi  = c.get("personal_info", {}) or {}
        edu = c.get("education",     []) or []
        exp = c.get("experience",    []) or []
        st  = pub_stats(c)
        miss = detect_missing(c)

        ssc  = get_deg(edu, ["ssc","matric","o-level","secondary"])
        hssc = get_deg(edu, ["hssc","fsc","f.sc","intermediate","a-level","ics"])
        bs   = get_deg(edu, ["bs ","bsc","bachelor","b.sc","b.e ","be ","beng","b.tech"])
        ms_  = get_deg(edu, ["ms ","msc","master","m.sc","m.eng","mphil","mba"])
        phd  = get_deg(edu, ["phd","doctor","ph.d"])

        row = [
            os.path.basename(src),
            pi.get("name",""),          pi.get("post_applied",""),
            pi.get("apply_date",""),    pi.get("present_employment",""),
            pi.get("nationality",""),   pi.get("marital_status",""),
            pi.get("current_salary",""), pi.get("expected_salary",""),
            ssc.get("grade_cgpa_percentage",""),  ssc.get("passing_year",""),
            hssc.get("grade_cgpa_percentage",""), hssc.get("passing_year",""),
            bs.get("degree",""),  bs.get("grade_cgpa_percentage",""), bs.get("passing_year",""),
            bs.get("institution","") or bs.get("board_university",""),
            ms_.get("degree",""), ms_.get("grade_cgpa_percentage",""), ms_.get("passing_year",""),
            ms_.get("institution","") or ms_.get("board_university",""),
            phd.get("degree",""), phd.get("grade_cgpa_percentage",""), phd.get("passing_year",""),
            phd.get("institution","") or phd.get("board_university",""),
            st["total"], st["journals"], st["conferences"],
            st["avg_if"] or "", st["max_if"] or "",
            len(exp),
            "; ".join(miss),
            "Yes" if miss else "No"
        ]
        ws1.append(row)

    auto_width(ws1)
    ws1.freeze_panes = "A2"

    # ── Sheet 2: Personal Info ─────────────────────────────────────────────────
    ws2 = wb.create_sheet("Personal Info")
    cols2 = ["Source File","Name","Father Name","DOB","Nationality","Marital Status",
             "Current Salary","Expected Salary","Present Employment","Apply Date","Post Applied"]
    ws2.append(cols2)
    style_header_row(ws2)
    for src, c in all_candidates:
        pi = c.get("personal_info", {}) or {}
        ws2.append([os.path.basename(src)] + [pi.get(k,"") for k in
            ["name","father_name","dob","nationality","marital_status",
             "current_salary","expected_salary","present_employment","apply_date","post_applied"]])
    auto_width(ws2)
    ws2.freeze_panes = "A2"

    # ── Sheet 3: Education ─────────────────────────────────────────────────────
    ws3 = wb.create_sheet("Education")
    cols3 = ["Source File","Candidate Name","Degree","Level","Specialization",
             "Grade / CGPA / %","Passing Year","Institution","Board / University"]
    ws3.append(cols3)
    style_header_row(ws3)
    for src, c in all_candidates:
        name = (c.get("personal_info") or {}).get("name","")
        for edu in (c.get("education") or []):
            ws3.append([os.path.basename(src), name,
                edu.get("degree",""), edu.get("level",""), edu.get("specialization",""),
                edu.get("grade_cgpa_percentage",""), edu.get("passing_year",""),
                edu.get("institution",""), edu.get("board_university","")])
    auto_width(ws3)
    ws3.freeze_panes = "A2"

    # ── Sheet 4: Experience ────────────────────────────────────────────────────
    ws4 = wb.create_sheet("Experience")
    cols4 = ["Source File","Candidate Name","Post","Organization","Location",
             "Start Date","End Date","Duration (months)","Employment Type"]
    ws4.append(cols4)
    style_header_row(ws4)
    for src, c in all_candidates:
        name = (c.get("personal_info") or {}).get("name","")
        for exp in (c.get("experience") or []):
            ws4.append([os.path.basename(src), name,
                exp.get("post",""), exp.get("organization",""), exp.get("location",""),
                exp.get("start_date",""), exp.get("end_date",""),
                exp.get("duration_months",""), exp.get("employment_type","")])
    auto_width(ws4)
    ws4.freeze_panes = "A2"

    # ── Sheet 5: Publications ──────────────────────────────────────────────────
    ws5 = wb.create_sheet("Publications")
    cols5 = ["Source File","Candidate Name","Title","Type","Author","Co-Authors",
             "Published In","Impact Factor","Volume","Pages","Year"]
    ws5.append(cols5)
    style_header_row(ws5)
    for src, c in all_candidates:
        name = (c.get("personal_info") or {}).get("name","")
        for pub in (c.get("publications") or []):
            ws5.append([os.path.basename(src), name,
                pub.get("title",""), pub.get("type",""), pub.get("author_name",""),
                pub.get("co_authors",""), pub.get("published_in",""),
                pub.get("impact_factor",""), pub.get("volume",""),
                pub.get("pages",""), pub.get("year","")])
    auto_width(ws5)
    ws5.freeze_panes = "A2"

    # ── Sheet 6: Awards & Patents ──────────────────────────────────────────────
    ws6 = wb.create_sheet("Awards & Patents")
    cols6 = ["Source File","Candidate Name","Category","Type / Patent #","Detail / Title"]
    ws6.append(cols6)
    style_header_row(ws6)
    for src, c in all_candidates:
        name = (c.get("personal_info") or {}).get("name","")
        for aw in (c.get("awards_scholarships") or []):
            ws6.append([os.path.basename(src), name, "Award/Scholarship",
                aw.get("type",""), aw.get("detail","")])
        for pt in (c.get("patents") or []):
            ws6.append([os.path.basename(src), name, "Patent",
                pt.get("patent_number",""), pt.get("title","")])
    auto_width(ws6)
    ws6.freeze_panes = "A2"

    # ── Sheet 7: Missing Info & Emails ─────────────────────────────────────────
    ws7 = wb.create_sheet("Missing Info & Emails")
    cols7 = ["Source File","Candidate Name","Post Applied","Missing Fields","Draft Email"]
    ws7.append(cols7)
    style_header_row(ws7)
    for src, c in all_candidates:
        pi   = c.get("personal_info", {}) or {}
        miss = detect_missing(c)
        email_text = draft_email(pi.get("name",""), pi.get("post_applied",""), miss) if miss else ""
        ws7.append([
            os.path.basename(src),
            pi.get("name",""),
            pi.get("post_applied",""),
            "; ".join(miss),
            email_text
        ])
    auto_width(ws7)
    ws7.freeze_panes = "A2"
    ws7.column_dimensions["E"].width = 60

    wb.save(out_path)


# ── Background Processing Job ─────────────────────────────────────────────────
def run_extraction_job(job_id: str, pdf_paths: list, api_key: str):
    client = init_groq_client(api_key)
    all_data = {}
    total_candidates = 0
    all_candidates_flat = []

    with jobs_lock:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["log"] = []

    def log(msg):
        with jobs_lock:
            jobs[job_id]["log"].append(msg)

    try:
        for pdf_path in pdf_paths:
            fname = os.path.basename(pdf_path)
            log(f"📄 Reading {fname}...")
            text = extract_text_from_pdf(pdf_path)
            if not text.strip():
                log(f"⚠️  {fname}: no text extracted (scanned PDF?)")
                continue

            sections = split_candidates(text)
            log(f"✂️  {fname}: {len(sections)} candidate(s) found")

            candidates = []
            for idx, section in enumerate(sections, 1):
                log(f"⚙️  [{idx}/{len(sections)}] Extracting...")
                result = extract_candidate(client, section)
                if result:
                    miss  = detect_missing(result)
                    name  = (result.get("personal_info") or {}).get("name", "(unnamed)")
                    result["_source"]  = fname
                    result["_missing"] = miss
                    result["_email"]   = draft_email(name,
                        (result.get("personal_info") or {}).get("post_applied",""), miss) if miss else ""
                    candidates.append(result)
                    all_candidates_flat.append(result)
                    total_candidates += 1
                    log(f"✅ {name}")
                else:
                    log(f"✗ Section {idx} — extraction failed")

                if client:
                    time.sleep(0.5)  # rate limit buffer

            if candidates:
                all_data[pdf_path] = candidates

            with jobs_lock:
                jobs[job_id]["progress"] = total_candidates

        # Save outputs
        ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
        xlsx_name = f"talash_{ts}.xlsx"
        json_name = f"talash_{ts}.json"
        xlsx_path = str(OUTPUT_DIR / xlsx_name)
        json_path = str(OUTPUT_DIR / json_name)

        if all_data:
            write_excel(all_data, xlsx_path)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(all_candidates_flat, f, indent=2, ensure_ascii=False)
            log(f"💾 Saved: {xlsx_name}")
        else:
            xlsx_path = json_path = ""
            log("⚠️  No data extracted.")

        # Compute dashboard stats
        stats = compute_stats(all_candidates_flat)

        with jobs_lock:
            jobs[job_id].update({
                "status":     "done",
                "candidates": all_candidates_flat,
                "total":      total_candidates,
                "xlsx":       xlsx_name if xlsx_path else "",
                "json":       json_name if json_path else "",
                "stats":      stats,
            })
        log(f"🎉 Done — {total_candidates} candidate(s) extracted")

    except Exception as e:
        with jobs_lock:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"]  = str(e)
        log(f"❌ Fatal error: {e}")
        app.logger.exception("Job failed")


def compute_stats(candidates: list) -> dict:
    total    = len(candidates)
    phd      = sum(1 for c in candidates if any(
        e.get("level","").lower() == "phd"
        for e in (c.get("education") or [])))
    with_pub = sum(1 for c in candidates if c.get("publications"))
    missing  = sum(1 for c in candidates if c.get("_missing"))
    return {"total": total, "phd": phd, "with_pub": with_pub, "missing": missing}


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/upload", methods=["POST"])
def upload():
    files   = request.files.getlist("files")
    api_key = request.form.get("api_key", "").strip()

    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files provided"}), 400

    job_id    = str(uuid.uuid4())[:8]
    pdf_paths = []

    for f in files:
        if not f.filename.lower().endswith(".pdf"):
            continue
        safe  = re.sub(r"[^\w\-.]", "_", f.filename)
        dest  = UPLOAD_DIR / f"{job_id}_{safe}"
        f.save(str(dest))
        pdf_paths.append(str(dest))

    if not pdf_paths:
        return jsonify({"error": "No valid PDF files found"}), 400

    with jobs_lock:
        jobs[job_id] = {
            "status": "queued", "progress": 0, "total": 0,
            "candidates": [], "stats": {}, "log": [],
            "xlsx": "", "json": "", "error": ""
        }

    t = threading.Thread(target=run_extraction_job, args=(job_id, pdf_paths, api_key), daemon=True)
    t.start()

    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>")
def status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify({
        "status":   job["status"],
        "progress": job["progress"],
        "total":    job["total"],
        "log":      job["log"][-20:],  # last 20 lines
        "stats":    job["stats"],
        "xlsx":     job["xlsx"],
        "json":     job["json"],
        "error":    job["error"],
    })


@app.route("/api/candidates/<job_id>")
def candidates(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job.get("candidates", []))


@app.route("/api/download/<filename>")
def download(filename):
    # Security: only allow filenames without path traversal
    safe = re.sub(r"[^\w\-.]", "", filename)
    path = OUTPUT_DIR / safe
    if not path.exists():
        return jsonify({"error": "File not found"}), 404
    return send_file(str(path), as_attachment=True)


if __name__ == "__main__":
    print("=" * 50)
    print("  TALASH — CV Extraction System")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000, use_reloader=False)
