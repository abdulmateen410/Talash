# TALASH - Quick Start Guide

Get up and running with TALASH in 5 minutes!

---

## 🚀 Quick Installation

### Option 1: Automated Setup (Recommended)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env file and add your Groq API key
# Get API key from: https://console.groq.com/

# 4. Run the application
python run.py
```

### Option 2: Manual Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Create .env file
echo "GROQ_API_KEY=your_actual_key_here" > .env
echo "SECRET_KEY=random_secret_key_123" >> .env

# 3. Start the server
python app.py
```

---

## 🔑 Get Your Groq API Key

1. Visit: **https://console.groq.com/**
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key to your `.env` file

---

## 🎯 First Steps

1. **Open your browser**: http://localhost:5000
2. **Create account**: Click "Sign Up" and create your credentials
3. **Login**: Use your credentials to access the dashboard
4. **Upload CVs**: 
   - Go to "Upload CVs" section
   - Drag & drop PDF or image files
   - Click "Process & Analyze"
5. **View Results**:
   - Dashboard: Overview and statistics
   - Rankings: Candidate rankings
   - Candidates: Detailed profiles
   - Analytics: Insights and charts

---

## 📁 Supported File Formats

- PDF (text-based or scanned)
- PNG, JPG, JPEG
- GIF, BMP, TIFF, WebP

---

## ⚙️ System Requirements

- **Python**: 3.8 or higher
- **RAM**: 2GB minimum (4GB recommended)
- **Disk Space**: 500MB
- **Internet**: Required for Groq API

---

## 🐛 Troubleshooting

### "Module not found" error
```bash
pip install --upgrade -r requirements.txt
```

### "Invalid API key" error
- Check your `.env` file
- Verify API key is correct
- Ensure no extra spaces

### "Port already in use"
- Change port in `app.py`: `app.run(port=5001)`

### Charts not showing
- Check internet connection (Chart.js uses CDN)

---

## 📚 Need More Help?

See the full **README.md** for:
- Detailed feature documentation
- Architecture overview
- API endpoints
- Advanced configuration
- Complete troubleshooting guide

---

## 🎓 Project Information

**Course**: CS 417 - Large Language Models  
**Semester**: Spring 2026  
**Milestone**: 3 (Complete System)

---

**Ready to revolutionize hiring? Let's go! 🚀**
