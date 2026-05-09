#!/usr/bin/env python3
"""
TALASH - Smart HR Recruitment System
Quick Start Script
"""

import os
import sys
import subprocess
from pathlib import Path

def print_banner():
    """Print application banner."""
    print("\n" + "=" * 70)
    print("  TALASH - Smart HR Recruitment System")
    print("  Talent Acquisition & Learning Automation for Smart Hiring")
    print("=" * 70 + "\n")

def check_python_version():
    """Check if Python version is adequate."""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Error: Python 3.8 or higher is required")
        print(f"   Current version: {version.major}.{version.minor}.{version.micro}")
        sys.exit(1)
    print(f"✓ Python {version.major}.{version.minor}.{version.micro} detected")

def check_dependencies():
    """Check if required packages are installed."""
    required = [
        'flask', 'pdfplumber', 'openpyxl', 'groq', 
        'dotenv', 'PIL', 'sklearn', 'pymongo'
    ]
    
    missing = []
    for package in required:
        try:
            if package == 'dotenv':
                __import__('dotenv')
            elif package == 'PIL':
                __import__('PIL')
            elif package == 'sklearn':
                __import__('sklearn')
            else:
                __import__(package)
        except ImportError:
            missing.append(package)
    
    if missing:
        print(f"❌ Missing packages: {', '.join(missing)}")
        print("\n   Install with: pip install -r requirements.txt\n")
        return False
    
    print("✓ All required packages installed")
    return True

def check_mongodb():
    """Check if MongoDB is accessible."""
    try:
        from pymongo import MongoClient
        client = MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=3000)
        client.server_info()
        client.close()
        print("✓ MongoDB connected (localhost:27017)")
        return True
    except Exception as e:
        print("⚠️  MongoDB connection failed")
        print("   Please start MongoDB:")
        print("   - Windows: Start MongoDB service")
        print("   - macOS: brew services start mongodb-community")
        print("   - Linux: sudo systemctl start mongod")
        return False

def check_env_file():
    """Check if .env file exists."""
    env_path = Path('.env')
    
    if not env_path.exists():
        print("⚠️  Warning: .env file not found")
        print("   Copy .env.example to .env and add your Groq API key")
        
        response = input("\n   Create .env file now? (y/n): ").strip().lower()
        if response == 'y':
            example = Path('.env.example')
            if example.exists():
                env_path.write_text(example.read_text())
                print("   ✓ Created .env file - please edit it with your API key")
            else:
                env_path.write_text("GROQ_API_KEY=your_api_key_here\nSECRET_KEY=change_this_secret_key\nMONGO_URI=mongodb://localhost:27017/\n")
                print("   ✓ Created .env file - please edit it with your API key")
        
        return False
    
    # Check if API key is set
    env_content = env_path.read_text()
    if 'your_groq_api_key_here' in env_content or 'your_api_key_here' in env_content:
        print("⚠️  Warning: Groq API key not configured in .env")
        print("   Get your API key from: https://console.groq.com/")
        return False
    
    print("✓ Environment file configured")
    return True

def create_directories():
    """Create necessary directories."""
    dirs = ['uploads', 'output', 'static/css', 'static/js', 'templates']
    
    for dir_path in dirs:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    print("✓ Directory structure ready")

def launch_app():
    """Launch the Flask application."""
    print("\n" + "─" * 70)
    print("  Starting TALASH Server...")
    print("  Access at: http://localhost:5000")
    print("  Press Ctrl+C to stop")
    print("─" * 70 + "\n")
    
    try:
        subprocess.run([sys.executable, 'app.py'])
    except KeyboardInterrupt:
        print("\n\n✓ Server stopped")
        sys.exit(0)

def main():
    """Main function."""
    print_banner()
    
    # Check Python version
    check_python_version()
    
    # Check dependencies
    if not check_dependencies():
        print("\nPlease install dependencies first:")
        print("  pip install -r requirements.txt\n")
        sys.exit(1)
    
    # Check MongoDB
    mongo_ok = check_mongodb()
    
    # Check environment
    env_ok = check_env_file()
    
    # Create directories
    create_directories()
    
    if not mongo_ok:
        print("\n⚠️  MongoDB not running - some features may not work")
        response = input("Continue anyway? (y/n): ").strip().lower()
        if response != 'y':
            sys.exit(0)
    
    if not env_ok:
        print("\n⚠️  Setup incomplete - please configure .env file first")
        response = input("Continue anyway? (y/n): ").strip().lower()
        if response != 'y':
            sys.exit(0)
    
    # Launch application
    launch_app()

if __name__ == '__main__':
    main()
