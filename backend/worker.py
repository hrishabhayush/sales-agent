from fastapi import FastAPI
from mangum import Mangum
from backend import app

# Cloudflare Workers handler
handler = Mangum(app, lifespan="off") 