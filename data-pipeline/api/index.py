"""
Vercel Serverless Function entry point
Re-exports the FastAPI ASGI app from api_server.py
"""
import sys, os

# Add the parent directory (data-pipeline/) to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api_server import app
