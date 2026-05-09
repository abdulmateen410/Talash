<<<<<<< HEAD
# TALASH - Smart HR Recruitment System

**Talent Acquisition & Learning Automation for Smart Hiring**

A comprehensive AI-powered recruitment system for university hiring needs, built using Large Language Models (LLMs). TALASH automates CV screening, candidate-job matching, academic and publication analysis, experience validation, and skill alignment assessment.

---

## 🎓 Course Information

**CS 417: Large Language Models (LLMs)**  
Spring 2026 | Faculty of Computing  
**Milestone 3 - Complete System**

---

## ✨ Features

### 📊 Comprehensive Candidate Analysis
- **Educational Profile Analysis**: SSC/HSSC performance, degree progression, institutional quality (THE/QS rankings), educational gaps detection
- **Research Profile Analysis**: 
  - Journal publication quality (WoS indexing, Scopus, Impact Factor, Quartile rankings)
  - Conference paper analysis (CORE rankings, maturity, indexing)
  - Authorship role determination (first author, corresponding author, co-author)
- **Topic Variability Analysis**: ML-powered clustering to measure research breadth vs. depth
- **Co-authorship Analysis**: Collaboration patterns, network analysis, frequent collaborators
- **Supervision Record**: MS/PhD student supervision, publications with students
- **Professional Experience**: Timeline consistency, gaps detection, career progression
- **Skill Alignment**: Evidence-based skill validation against experience and publications
- **Patents & Books**: Intellectual property and scholarly writing analysis

### 🏆 Advanced Ranking System
- Multi-dimensional scoring (Education: 20%, Research: 35%, Experience: 25%, Skills: 10%, Collaboration: 10%)
- Tier-based classification (Excellent, Very Good, Good, Fair, Needs Improvement)
- Comparative rankings with detailed breakdowns
- Interactive score visualizations

### 📈 Analytics Dashboard
- Real-time statistics and insights
- Publication quality distribution
- Collaboration pattern charts
- Topic diversity analysis
- Experience trend visualization
- Educational, research, and professional insights

### 📧 Automated Email Generation
- Missing information detection
- Personalized draft emails for each candidate
- Professional formatting and templates

### 🎨 Modern UI/UX
- Glassmorphism design with crystal colors
- Gradient accents and smooth transitions
- Interactive charts (Chart.js)
- Responsive layout
- Real-time processing updates

---

## 🚀 Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- Groq API key ([Get one here](https://console.groq.com/))
- Optional: Tesseract OCR for scanned PDF support

### Step 1: Clone or Extract Project

```bash
cd talash_milestone3
```

### Step 2: Create Virtual Environment (Recommended)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies

=======
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
>>>>>>> b8d7e1b9e1f42284c13a100357605e83c6a8433e
```bash
pip install -r requirements.txt
```

<<<<<<< HEAD
### Step 4: Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Groq API key:

```
GROQ_API_KEY=your_actual_groq_api_key_here
SECRET_KEY=your_random_secret_key_here
```

### Step 5: Optional - Install Tesseract OCR

**Windows:**
- Download from: https://github.com/UB-Mannheim/tesseract/wiki
- Add to PATH during installation

**macOS:**
```bash
brew install tesseract
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install tesseract-ocr
```

---

## 🎯 Usage

### Start the Application

=======
### Step 4 — Run the app
>>>>>>> b8d7e1b9e1f42284c13a100357605e83c6a8433e
```bash
python app.py
```

<<<<<<< HEAD
The application will start on: **http://localhost:5000**

### First Time Setup

1. **Create Account**: Click "Sign Up" and create your credentials
2. **Login**: Use your credentials to access the system

### Processing CVs

1. **Upload CVs**:
   - Navigate to "Upload CVs" section
   - Drag & drop PDF/image files or click "Browse Files"
   - Supported formats: PDF, PNG, JPG, JPEG, GIF, BMP, TIFF, WebP

2. **Process & Analyze**:
   - Click "Process & Analyze" button
   - Monitor real-time progress in the log
   - Wait for completion (processing time varies based on file count and complexity)

3. **View Results**:
   - **Dashboard**: Overview statistics and top candidates
   - **Rankings**: Detailed candidate rankings with score breakdowns
   - **Candidates**: Searchable candidate list with detailed profiles
   - **Analytics**: Research and professional insights
   - **Emails**: Draft emails for missing information

4. **Download Reports**:
   - Excel Report: Comprehensive candidate data with all analyses
   - JSON Data: Structured data for further processing

---

## 📁 Project Structure

```
talash_milestone3/
├── app.py                      # Main Flask application
├── requirements.txt            # Python dependencies
├── .env.example               # Environment configuration template
├── README.md                  # This file
├── templates/
│   ├── index.html            # Main dashboard interface
│   └── login.html            # Authentication page
├── static/
│   ├── css/
│   │   └── style.css        # Modern glassmorphism styling
│   └── js/
│       └── main.js          # Frontend logic and interactivity
├── uploads/                   # Uploaded CV files (auto-created)
├── output/                    # Generated reports (auto-created)
└── users.json                # User authentication data (auto-created)
=======
### Step 5 — Open in browser
```
http://localhost:5000
>>>>>>> b8d7e1b9e1f42284c13a100357605e83c6a8433e
```

---

<<<<<<< HEAD
## 🔧 Technical Details

### Architecture

- **Backend**: Flask (Python web framework)
- **LLM**: Groq (Llama 3.3 70B for extraction, Llama 4 Scout for vision)
- **PDF Processing**: pdfplumber, PyMuPDF
- **OCR**: pytesseract + Groq Vision API
- **ML Analysis**: scikit-learn (TF-IDF, K-means clustering)
- **Data Export**: openpyxl (Excel generation)
- **Frontend**: Vanilla JS + Chart.js
- **Styling**: Custom CSS with glassmorphism

### CV Processing Pipeline

1. **Text Extraction**:
   - Text-layer PDFs → pdfplumber
   - Scanned PDFs → PyMuPDF + OCR (Tesseract or Groq Vision)
   - Images → Pillow + OCR

2. **Structured Extraction**:
   - LLM-powered parsing to JSON format
   - Personal info, education, experience, publications, skills, etc.

3. **Comprehensive Analysis**:
   - Educational progression and institutional quality
   - Research output quality (journals, conferences)
   - Topic variability (ML clustering)
   - Co-authorship patterns
   - Professional timeline validation
   - Skill evidence verification

4. **Ranking & Scoring**:
   - Multi-dimensional weighted scoring
   - Tier classification
   - Comparative analysis

5. **Report Generation**:
   - Excel workbook with multiple sheets
   - JSON export for integration
   - Draft emails for incomplete profiles

---

## 📊 Functional Modules (Milestone 3 Complete)

### ✅ Implemented Features

- [x] **Pre-Processing Module**: PDF/Image parsing to structured Excel/CSV
- [x] **Educational Profile Analysis**: Performance, progression, gaps, institutional quality
- [x] **Research Profile Analysis**: Journal/conference quality, authorship roles
- [x] **Student Supervision**: MS/PhD supervision records
- [x] **Books & Patents**: Scholarly writing and IP analysis
- [x] **Topic Variability**: ML-powered research breadth analysis
- [x] **Co-author Analysis**: Collaboration network patterns
- [x] **Professional Experience**: Timeline consistency, gaps, progression
- [x] **Skill Alignment**: Evidence-based skill validation
- [x] **Web Application**: Full-featured dashboard with auth
- [x] **Ranking System**: Multi-dimensional candidate scoring ⭐ **EXTRA CREDIT**
- [x] **Analytics Dashboard**: Research and professional insights
- [x] **Email Generation**: Personalized missing-info requests
- [x] **Download Reports**: Excel and JSON exports

---

## 🏆 Evaluation Checklist (Milestone 3)

| Criterion | Weight | Status |
|-----------|--------|--------|
| **Completion of functional modules** | 30 marks | ✅ Complete |
| - Educational Profile Analysis | 6 | ✅ |
| - Research Profile Analysis (journals/conferences) | 7 | ✅ |
| - Topic variability and co-author analysis | 6 | ✅ |
| - Student supervision, patents, books | 5 | ✅ |
| - Professional experience and employment history | 6 | ✅ |
| **Candidate assessment report and summary** | 6 marks | ✅ Complete |
| **Tabular and graphical presentation** | 6 marks | ✅ Complete |
| **Web application integration, UI/UX** | 8 marks | ✅ Complete |
| **EXTRA: Candidate Ranking Module** | +10 marks | ⭐ **Implemented** |
| **TOTAL** | **50 + 10** | **60 marks** |

---

## 🎨 UI Features

### Modern Design System
- **Glassmorphism Effects**: Frosted glass cards with backdrop blur
- **Crystal Colors**: Gradient accents (purple, blue, pink, green)
- **Smooth Transitions**: 0.3s cubic-bezier easing
- **Interactive Elements**: Hover effects, button animations
- **Responsive Layout**: Works on desktop, tablet, mobile
- **Professional Typography**: DM Sans font family

### Visual Components
- **Real-time Charts**: Doughnut, radar, bar, line, scatter charts
- **Score Visualizations**: Color-coded tiers and breakdowns
- **Progress Tracking**: Live log updates during processing
- **Search & Filter**: Instant candidate filtering
- **Detail Views**: Expandable candidate profiles

---

## 🔐 Authentication

- User registration and login system
- Session-based authentication
- Secure password hashing (SHA-256)
- Protected routes and API endpoints

---

## 📝 API Endpoints

### Authentication
- `GET /login` - Login page
- `POST /api/login` - Authenticate user
- `POST /api/signup` - Register new user
- `POST /api/logout` - End session
- `GET /api/me` - Get current user

### Application
- `GET /` - Main dashboard (requires auth)
- `POST /api/upload` - Upload CV files
- `GET /api/status/<job_id>` - Check processing status
- `GET /api/candidates/<job_id>` - Get analyzed candidates
- `GET /api/download/<filename>` - Download generated reports
- `GET /api/mode` - Check system capabilities

---

## 🔬 Research Analysis Details

### Journal Publication Analysis
- ISSN verification
- Web of Science indexing check
- Scopus indexing status
- Impact Factor retrieval
- Quartile ranking (Q1, Q2, Q3, Q4)
- Authorship role determination

### Conference Publication Analysis
- CORE ranking lookup (A*, A, B, C)
- Conference maturity assessment
- Indexing status (IEEE, ACM, Springer)
- Publisher verification

### Topic Variability
- TF-IDF vectorization of publication titles
- K-means clustering (3-5 clusters)
- Diversity score calculation
- Research focus classification

### Co-authorship Network
- Unique collaborator counting
- Frequent collaborator identification
- Average co-authors per paper
- Collaboration breadth assessment

---

## 🐛 Troubleshooting

### Common Issues

**1. Import Errors**
```bash
# Reinstall dependencies
pip install --upgrade -r requirements.txt
```

**2. Groq API Errors**
- Verify API key in `.env` file
- Check API quota: https://console.groq.com/
- Ensure API key has proper permissions

**3. PDF Extraction Fails**
- Install Tesseract OCR for scanned PDFs
- Check PDF file isn't corrupted
- Try re-saving PDF from original application

**4. Port Already in Use**
```bash
# Change port in app.py:
# app.run(debug=True, port=5001)
```

**5. Chart.js Not Loading**
- Check internet connection (CDN dependency)
- Or download Chart.js locally

---

## 📚 Technologies Used

- **Python 3.8+**: Core language
- **Flask 2.3+**: Web framework
- **Groq API**: LLM inference
- **pdfplumber**: PDF text extraction
- **PyMuPDF**: PDF rendering
- **Pillow**: Image processing
- **pytesseract**: OCR engine
- **scikit-learn**: Machine learning (clustering, vectorization)
- **openpyxl**: Excel generation
- **Chart.js 4.4**: Data visualization
- **HTML5/CSS3/JavaScript**: Frontend

---

## 👥 Contributors

**CS 417 Term Project**  
Faculty of Computing  
Spring 2026  

---

## 📄 License

This project is developed for academic purposes as part of CS 417 coursework.

---

## 🙏 Acknowledgments

- Prof. Dr. Muhammad Moazam Fraz (Instructor)
- Groq for LLM API access
- Open-source community for libraries

---

## 📞 Support

For issues or questions:
1. Check this README thoroughly
2. Review error messages in browser console
3. Check Flask terminal output
4. Verify `.env` configuration

---

## 🎯 Future Enhancements (Optional)

- [ ] Real external API integration (THE/QS rankings, CORE, Scopus)
- [ ] Multi-language CV support
- [ ] Resume parsing for non-academic positions
- [ ] Interview scheduling integration
- [ ] Email sending automation (SMTP)
- [ ] Advanced NLP for deeper content analysis
- [ ] Export to ATS (Applicant Tracking Systems)
- [ ] Mobile app version

---

**Built with ❤️ for Smart Hiring**
=======
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
>>>>>>> b8d7e1b9e1f42284c13a100357605e83c6a8433e
