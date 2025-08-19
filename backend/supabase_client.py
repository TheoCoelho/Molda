import os
from supabase import create_client
from dotenv import load_dotenv

# Carrega variáveis do .env na inicialização do app
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env")

# Client com Service Role (ignora RLS) — uso exclusivo do backend
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
